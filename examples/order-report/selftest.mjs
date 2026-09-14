// 验证教学样例本身：起点确实失败，参考修复通过，保护文件的变更被拒绝。
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, copyFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const temp = mkdtempSync(join(tmpdir(), 'pi-book-orders-'));
const base = fileURLToPath(new URL('.', import.meta.url));
const run = script => spawnSync(process.execPath, [script, temp], { cwd: temp, encoding: 'utf8' });
try {
  cpSync(join(base, 'starter'), temp, { recursive: true });
  assert.notEqual(run(join(temp, 'check.mjs')).status, 0, '教学缺陷应被检查发现');
  assert.notEqual(run(join(base, 'verify.mjs')).status, 0, '外部检查也应发现缺陷');
  copyFileSync(join(base, 'solution/report.mjs'), join(temp, 'report.mjs'));
  for (const script of [join(temp, 'check.mjs'), join(base, 'verify.mjs')]) {
    const result = run(script);
    assert.equal(result.status, 0, result.stderr);
    process.stdout.write(result.stdout);
  }
  appendFileSync(join(temp, 'check.mjs'), '\n// changed\n');
  assert.notEqual(run(join(base, 'verify.mjs')).status, 0, '必须拒绝更改验收脚本');
  console.log('PASS: expected failure, reference fix, and tamper detection');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
