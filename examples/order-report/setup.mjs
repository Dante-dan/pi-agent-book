import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const target = resolve(process.argv[2] ?? '.workshop/order-report');
if (existsSync(target)) {
  console.error(`目录已存在，未覆盖：${target}\n请指定另一个练习目录：node examples/order-report/setup.mjs .workshop/order-report-2`);
  process.exit(1);
}
mkdirSync(target, { recursive: true });
cpSync(fileURLToPath(new URL('./starter/', import.meta.url)), target, { recursive: true });
console.log(`练习已创建：${target}\n请进入该目录并运行 node check.mjs；初始版本应检查失败。`);
