// 教学起点：这里故意保留了把退款订单计入汇总的缺陷。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarize(orders) {
  return orders.reduce((result, order) => ({
    totalCents: result.totalCents + order.amountCents,
    paidCount: result.paidCount + 1,
  }), { totalCents: 0, paidCount: 0 });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const orders = JSON.parse(readFileSync(new URL('./orders.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(summarize(orders), null, 2));
}
