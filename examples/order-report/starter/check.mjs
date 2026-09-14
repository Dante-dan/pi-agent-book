// 本地检查；外部 verify.mjs 还会核对本文件和数据未被修改。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarize } from './report.mjs';
const orders = JSON.parse(readFileSync(new URL('./orders.json', import.meta.url), 'utf8'));
assert.deepEqual(summarize(orders), { totalCents: 3500, paidCount: 2 });
assert.deepEqual(summarize([]), { totalCents: 0, paidCount: 0 });
assert.deepEqual(summarize([{ status: 'refunded', amountCents: 500 }]), { totalCents: 0, paidCount: 0 });
console.log('PASS: paid orders = 2, totalCents = 3500');
