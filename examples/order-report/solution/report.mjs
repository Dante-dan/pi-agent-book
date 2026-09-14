// 参考修复：只累计仍为 paid 状态的订单，整数分不转换成浮点元。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarize(orders) {
  return orders.filter(order => order.status === 'paid').reduce((result, order) => ({
    totalCents: result.totalCents + order.amountCents,
    paidCount: result.paidCount + 1,
  }), { totalCents: 0, paidCount: 0 });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const orders = JSON.parse(readFileSync(new URL('./orders.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(summarize(orders), null, 2));
}
