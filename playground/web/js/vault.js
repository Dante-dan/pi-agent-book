// API key 的本地保管。
// 默认：key 只留在这个页面的内存里，刷新即消失。
// 勾选“记住”：用你设的口令经 PBKDF2 派生密钥，AES-GCM 加密后存进 localStorage。
// 口令本身不保存；明文 key 不落盘。服务端也不保存 key（见 playground/server/index.mjs）。

const STORAGE_KEY = 'pi-workshop-vault-v1';
const ITERATIONS = 310_000;

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function describeConfig(config) {
  if (!config || config.mode === 'puppet') return '提线木偶';
  if (config.mode === 'builtin') return `${config.provider} / ${config.model}`;
  try {
    return `${new URL(config.baseUrl).hostname} / ${config.model}`;
  } catch {
    return config.model;
  }
}

export function savedHint() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw).hint ?? '已保存的配置' : null;
  } catch {
    return null;
  }
}

export async function saveEncrypted(config, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(config)));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), data: b64(cipher), hint: describeConfig(config) }));
}

export async function unlock(passphrase) {
  const record = JSON.parse(localStorage.getItem(STORAGE_KEY));
  const key = await deriveKey(passphrase, unb64(record.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(record.iv) }, key, unb64(record.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

export function forget() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 无痕模式下可能不可用 */
  }
}
