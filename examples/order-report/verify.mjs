// 从练习目录外运行的教学验证器；不是恶意代码沙箱。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const target = resolve(process.argv[2] ?? '.workshop/order-report');
for (const name of ['orders.json', 'check.mjs']) {
  assert.equal(readFileSync(join(target, name), 'utf8'), readFileSync(new URL(`./starter/${name}`, import.meta.url), 'utf8'), `${name} 不得修改`);
}
const { summarize } = await import(pathToFileURL(join(target, 'report.mjs')).href);
const cases = [
  { orders: [], expected: { totalCents: 0, paidCount: 0 } },
  { orders: [{ status: 'paid', amountCents: 99 }], expected: { totalCents: 99, paidCount: 1 } },
  { orders: [{ status: 'refunded', amountCents: 500 }], expected: { totalCents: 0, paidCount: 0 } },
  { orders: [{ status: 'pending', amountCents: 800 }, { status: 'paid', amountCents: 200 }, { status: 'paid', amountCents: 0 }], expected: { totalCents: 200, paidCount: 2 } },
  { orders: JSON.parse(readFileSync(join(target, 'orders.json'), 'utf8')), expected: { totalCents: 3500, paidCount: 2 } },
];
for (const testCase of cases) assert.deepEqual(summarize(testCase.orders), testCase.expected);
console.log(`PASS: ${cases.length} cases; orders.json and check.mjs unchanged`);
