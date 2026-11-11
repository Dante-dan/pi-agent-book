// 出站请求防护：这个进程唯一合法的出站流量，是把用户的请求转给公网上的模型服务。
// 任何指向内网、回环、链路本地、云元数据地址的连接都在建立之前被拒绝，
// 包括域名解析到内网地址（DNS rebinding）和跳转到 IP 字面量的情况。
import dns from 'node:dns';
import net from 'node:net';
import { Agent, buildConnector, setGlobalDispatcher } from 'undici';

const V4_BLOCKED = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
];

function v4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}

function isBlockedV4(ip) {
  const value = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (v4ToInt(base) & mask) >>> 0;
  });
}

/** 是否为不允许连接的地址。无法识别的一律按不允许处理。 */
export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isBlockedV4(address);
  if (family !== 6) return true;
  const lower = address.toLowerCase().split('%')[0];
  if (lower === '::' || lower === '::1') return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  if (lower.startsWith('::ffff:')) return true; // 十六进制写法的 v4 映射，直接拒绝
  if (/^f[cd]/.test(lower)) return true; // fc00::/7 唯一本地
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 链路本地
  if (lower.startsWith('ff')) return true; // 组播
  if (lower.startsWith('64:ff9b:')) return true; // NAT64
  if (lower.startsWith('2001:db8:')) return true; // 文档用
  return false;
}

function guardedLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: net.isIP(addresses) }];
    const bad = list.find((entry) => isBlockedAddress(entry.address));
    if (bad || list.length === 0) {
      const error = new Error(`出站连接被拒绝：${hostname} 解析到了非公网地址`);
      error.code = 'EBLOCKED';
      return callback(error);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

/** 安装全局出站防护。必须在创建任何 Pi 会话之前调用一次。 */
export function installNetGuard() {
  const base = buildConnector({ lookup: guardedLookup, timeout: 10_000 });
  const connect = (options, callback) => {
    const host = String(options.hostname ?? '').replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isBlockedAddress(host)) {
      const error = new Error(`出站连接被拒绝：${host} 不是公网地址`);
      error.code = 'EBLOCKED';
      return callback(error, null);
    }
    return base(options, callback);
  };
  setGlobalDispatcher(new Agent({ connect, headersTimeout: 60_000, bodyTimeout: 120_000 }));
}

/**
 * 校验用户自填的模型服务地址。只做语法层面的收紧；
 * 真正的防线是上面的连接级检查，这里只是让明显不对的输入尽早报错。
 */
export function validateBaseUrl(input) {
  if (typeof input !== 'string' || input.length > 200) throw new Error('模型服务地址过长或格式不对');
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('模型服务地址不是合法的 URL');
  }
  if (url.protocol !== 'https:') throw new Error('模型服务地址必须以 https:// 开头');
  if (url.username || url.password) throw new Error('模型服务地址里不能带用户名或密码');
  if (url.search || url.hash) throw new Error('模型服务地址里不能带查询参数或 # 片段');
  if (url.port && url.port !== '443') throw new Error('模型服务地址只能使用 443 端口');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) throw new Error('模型服务地址必须是域名，不能是 IP');
  if (!host.includes('.') || /\.(local|internal|lan|home|localhost)$/i.test(host) || host === 'localhost') {
    throw new Error('模型服务地址必须是公网域名');
  }
  if (/[{}$!`\\\s]/.test(input)) throw new Error('模型服务地址包含不允许的字符');
  return url.origin + url.pathname.replace(/\/+$/, '');
}
