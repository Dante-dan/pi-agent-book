# 订单汇总练习

配合[第一章](../../book/01-first-agent.md)使用。只依赖 Node.js，无第三方依赖、无网络请求。

在书籍仓库根目录执行：

```bash
node examples/order-report/setup.mjs
cd .workshop/order-report
node check.mjs
pi
```

初始检查失败是预期行为。请让 Pi 只修改 `report.mjs`，按规则汇总 `paid` 订单。修复后执行：

```bash
node check.mjs
node ../../examples/order-report/verify.mjs .
```

第二条检查在练习之外保存了原始数据和验收脚本，会核对它们未被修改，并检查五组输入。它依然会执行被检查的 JavaScript，不是恶意代码隔离环境；练习不包含真实订单或凭证。

没有模型账户时，可阅读 `solution/report.mjs`。从仓库根目录运行下面的命令，验证教学缺陷能被发现、参考修复能通过、修改验收脚本会被拒绝：

```bash
node examples/order-report/selftest.mjs
```

`setup.mjs` 不覆盖已有目录。重复练习可以指定新目录：

```bash
node examples/order-report/setup.mjs .workshop/order-report-2
```

业务口径：金额采用整数分；仅统计仍为 `paid` 的订单。`refunded`、`pending` 等其他状态不计入。不讨论税费、币种转换、部分退款或净现金流。扩展业务范围时，先增加明确规则和独立验收数据。
