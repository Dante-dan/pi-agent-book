// 虚拟文件系统：每次运行独享一个内存 Map，不接触真实磁盘。
// Pi 的 read / write / edit / ls 工具通过可替换的 operations 接口落到这里。
import { posix } from 'node:path';

export const ROOT = '/workspace';
const MAX_FILES = 48;
const MAX_FILE_BYTES = 48 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024;

export class VfsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class VirtualFs {
  /** @param {Record<string,string>} seed 相对路径 → 内容 */
  constructor(seed = {}) {
    /** @type {Map<string,string>} */
    this.files = new Map();
    /** @type {{op:string, path:string, bytes?:number}[]} */
    this.journal = [];
    for (const [rel, content] of Object.entries(seed)) this.files.set(posix.join(ROOT, rel), content);
  }

  /** 把任意输入路径规范化到 /workspace 之内；越界一律拒绝。 */
  resolve(input) {
    if (typeof input !== 'string' || input.length === 0 || input.length > 512 || input.includes('\0')) {
      throw new VfsError('EINVAL', '路径不合法');
    }
    const abs = posix.resolve(ROOT, input);
    if (abs !== ROOT && !abs.startsWith(ROOT + '/')) {
      throw new VfsError('EACCES', `越界访问被拒绝：${input}（本演示只有 ${ROOT} 下的虚拟文件）`);
    }
    return abs;
  }

  rel(abs) {
    return abs === ROOT ? '.' : abs.slice(ROOT.length + 1);
  }

  isDir(abs) {
    if (abs === ROOT) return true;
    const prefix = abs + '/';
    for (const key of this.files.keys()) if (key.startsWith(prefix)) return true;
    return false;
  }

  exists(input) {
    const abs = this.resolve(input);
    return this.files.has(abs) || this.isDir(abs);
  }

  read(input) {
    const abs = this.resolve(input);
    if (!this.files.has(abs)) {
      if (this.isDir(abs)) throw new VfsError('EISDIR', `EISDIR: 这是目录，不是文件：${this.rel(abs)}`);
      throw new VfsError('ENOENT', `ENOENT: 文件不存在：${this.rel(abs)}`);
    }
    this.journal.push({ op: 'read', path: this.rel(abs) });
    return this.files.get(abs);
  }

  write(input, content) {
    const abs = this.resolve(input);
    if (abs === ROOT || this.isDir(abs)) throw new VfsError('EISDIR', `EISDIR: 不能覆盖目录：${this.rel(abs)}`);
    const text = String(content);
    const bytes = Buffer.byteLength(text);
    if (bytes > MAX_FILE_BYTES) throw new VfsError('EFBIG', `文件过大：演示环境单个文件上限 ${MAX_FILE_BYTES} 字节`);
    if (!this.files.has(abs) && this.files.size >= MAX_FILES) throw new VfsError('ENOSPC', `文件过多：演示环境最多 ${MAX_FILES} 个文件`);
    let total = bytes;
    for (const [key, value] of this.files) if (key !== abs) total += Buffer.byteLength(value);
    if (total > MAX_TOTAL_BYTES) throw new VfsError('ENOSPC', '虚拟磁盘已满');
    this.files.set(abs, text);
    this.journal.push({ op: 'write', path: this.rel(abs), bytes });
  }

  list(input = '.') {
    const abs = this.resolve(input);
    if (this.files.has(abs)) throw new VfsError('ENOTDIR', `ENOTDIR: 不是目录：${this.rel(abs)}`);
    if (!this.isDir(abs)) throw new VfsError('ENOENT', `ENOENT: 目录不存在：${this.rel(abs)}`);
    const prefix = abs === ROOT ? ROOT + '/' : abs + '/';
    const names = new Set();
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]);
    }
    return [...names].sort();
  }

  /** 给前端画“文件柜”用的快照。 */
  snapshot() {
    return [...this.files.entries()]
      .map(([abs, content]) => ({ path: this.rel(abs), bytes: Buffer.byteLength(content), content }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  // ---- Pi 工具的 operations 适配 ----
  readOps() {
    return {
      readFile: async (p) => Buffer.from(this.read(p)),
      access: async (p) => {
        const abs = this.resolve(p);
        if (!this.files.has(abs)) throw new VfsError('ENOENT', `ENOENT: 文件不存在：${this.rel(abs)}`);
      },
      detectImageMimeType: async () => null,
    };
  }

  writeOps() {
    return {
      writeFile: async (p, content) => this.write(p, content),
      mkdir: async (p) => {
        this.resolve(p);
      },
    };
  }

  editOps() {
    return { ...this.readOps(), writeFile: async (p, content) => this.write(p, content) };
  }

  lsOps() {
    return {
      exists: (p) => this.exists(p),
      stat: (p) => {
        const abs = this.resolve(p);
        if (!this.files.has(abs) && !this.isDir(abs)) throw new VfsError('ENOENT', `ENOENT: 不存在：${this.rel(abs)}`);
        const dir = !this.files.has(abs);
        return { isDirectory: () => dir, isFile: () => !dir, size: dir ? 0 : Buffer.byteLength(this.files.get(abs)) };
      },
      readdir: (p) => this.list(p),
    };
  }
}
