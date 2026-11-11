// π 工坊服务端入口。
// 只做四件事：发静态页面、发正文、发关卡与模型清单、跑一次受控的 Pi 运行并把事件流回去。
// 不记录请求体，不记录 API key，不写磁盘。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChapters } from './content.mjs';
import { getMission, publicWorld } from './levels.mjs';
import { ConfigError, getCatalog, validateModelConfig } from './models.mjs';
import { installNetGuard } from './netguard.mjs';
import { LIMITS, describeTools, runMission } from './run.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const SOURCE_URL = 'https://github.com/Dante-dan/pi-agent-book/tree/main/playground';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_GLOBAL_RUNS = 16;
const MAX_RUNS_PER_IP = 2;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_RUNS_PER_WINDOW = 40;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

installNetGuard();
const chapters = await loadChapters();
const world = { ...publicWorld(), toolSpecs: describeTools() };

// ---- 限流：全部在内存里，按 Cloudflare 传来的访客 IP 计 ----
let globalRuns = 0;
/** @type {Map<string, {active: number, stamps: number[]}>} */
const visitors = new Map();
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [ip, record] of visitors) {
    record.stamps = record.stamps.filter((t) => t > cutoff);
    if (record.active === 0 && record.stamps.length === 0) visitors.delete(ip);
  }
}, 60_000).unref();

function clientIp(req) {
  const header = req.headers['cf-connecting-ip'];
  return (typeof header === 'string' && header) || req.socket.remoteAddress || 'unknown';
}

function acquire(ip) {
  const record = visitors.get(ip) ?? { active: 0, stamps: [] };
  visitors.set(ip, record);
  const cutoff = Date.now() - WINDOW_MS;
  record.stamps = record.stamps.filter((t) => t > cutoff);
  if (globalRuns >= MAX_GLOBAL_RUNS) return '工坊现在人太多，稍等几秒再试。';
  if (record.active >= MAX_RUNS_PER_IP) return '你已经有运行在进行中，等它结束再开下一个。';
  if (record.stamps.length >= MAX_RUNS_PER_WINDOW) return '运行得太频繁了，歇几分钟再来。';
  record.active++;
  record.stamps.push(Date.now());
  globalRuns++;
  return null;
}

function release(ip) {
  globalRuns = Math.max(0, globalRuns - 1);
  const record = visitors.get(ip);
  if (record) record.active = Math.max(0, record.active - 1);
}

function sendJson(res, status, body, extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new ConfigError('请求体过大');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ConfigError('请求体不是合法的 JSON');
  }
}

async function handleRun(req, res) {
  // 只接受本站页面发来的 JSON 请求，挡掉跨站表单提交。
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return sendJson(res, 415, { error: '只接受 application/json' });
  if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return sendJson(res, 403, { error: '只接受本站页面发起的请求' });

  let body;
  let config;
  try {
    body = await readJsonBody(req);
    if (typeof body.mission !== 'string' || !getMission(body.mission)) throw new ConfigError('没有这个任务');
    if (!Array.isArray(body.parts) || body.parts.length > 16 || body.parts.some((part) => typeof part !== 'string' || part.length > 24)) throw new ConfigError('零件清单不合法');
    config = validateModelConfig(body.model);
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof ConfigError ? error.message : '请求不合法' });
  }

  const ip = clientIp(req);
  const refused = acquire(ip);
  if (refused) return sendJson(res, 429, { error: refused });

  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });

  // 兜底脱敏：即使上游在报错里回显了 key，也不会原样流回页面。
  const secret = config.key;
  const emit = (type, data) => {
    if (res.writableEnded) return;
    let payload = JSON.stringify(data);
    if (secret) payload = payload.split(secret).join('[已隐藏的 key]');
    res.write(`event: ${type}\ndata: ${payload}\n\n`);
  };

  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const heartbeat = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), 15_000);

  try {
    await runMission({ missionId: body.mission, parts: body.parts, config, emit, signal: controller.signal });
  } catch (error) {
    emit('fatal', { error: error instanceof ConfigError ? error.message : '运行失败，请稍后再试。' });
    if (!(error instanceof ConfigError)) console.error('[run] failed:', error?.name ?? 'Error');
  } finally {
    clearInterval(heartbeat);
    release(ip);
    res.end();
  }
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^[/\\]+/, '');
  const file = join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR)) return sendJson(res, 404, { error: 'not found' });
  try {
    const data = await readFile(file);
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    const cache = rel.startsWith('fonts/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': cache });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { pathname } = url;
    if (req.method === 'POST' && pathname === '/api/run') return await handleRun(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });
    if (pathname === '/api/healthz') return sendJson(res, 200, { ok: true });
    if (pathname === '/api/world') return sendJson(res, 200, { ...world, source: SOURCE_URL, limits: LIMITS });
    if (pathname === '/api/catalog') return sendJson(res, 200, await getCatalog());
    if (pathname.startsWith('/api/chapter/')) {
      const chapter = chapters.get(pathname.slice('/api/chapter/'.length));
      return chapter ? sendJson(res, 200, chapter) : sendJson(res, 404, { error: '这一章还在施工' });
    }
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });
    return await serveStatic(req, res, pathname);
  } catch (error) {
    console.error('[http] failed:', error?.name ?? 'Error');
    if (!res.headersSent) sendJson(res, 500, { error: '服务器开小差了' });
    else res.end();
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.listen(PORT, HOST, () => console.log(`π 工坊已启动：http://${HOST}:${PORT}`));

for (const signalName of ['SIGTERM', 'SIGINT']) {
  process.on(signalName, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
