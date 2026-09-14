# 有模型账户的配套实验

这组实验让真实模型通过 Pi 工作，并保存过程与验收结果。它与无需账户的[工具函数实验](../tool-contract/README.md)不同：工具函数正确，不代表模型总能正确选择和使用它们。

**发布时状态：实验脚本经过本地静态检查、事件解析检查和 dry-run；尚未使用真实模型账户完成端到端运行。** 请把自己运行后的结果当作证据，不把下面的预期观察当作已取得的成绩。

## 1. 准备一个账户

你需要 Node.js 22.19.0 或以上，以及 Pi 0.85.1：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.1
pi --version
pi
```

在 Pi 内输入 `/login`，选择你申请的服务并按提示认证；然后用 `/model` 选择支持工具调用的模型。可以使用 Pi 支持的订阅登录，也可以申请相应供应商的 API key。具体供应商支持见[本书版本的认证说明](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/providers.md)。

申请账户后，先在交互界面发送一句“请用一句话介绍自己”，确认认证与模型可用。再 `/quit` 返回终端，运行：

```bash
pi --list-models
```

记下要用的 provider 和 model ID。下面的 `YOUR_PROVIDER`、`YOUR_MODEL_ID` 必须换成你的实际值。模型与价格不断变化，因此实验没有绑定某一家，也不根据名称宣称哪个模型最好。

认证通过 Pi 自己的登录或环境变量配置。不要把 API key 写进实验命令、代码、Git 提交或 issue。实验不要求将凭证交给本书作者。

## 2. 先 dry-run，再运行真实模型

从本书仓库根目录执行：

```bash
node examples/live-model/run.mjs repair --provider YOUR_PROVIDER --model YOUR_MODEL_ID
```

默认只创建虚构输入和 `manifest.json`，不会启动 Pi，更不会请求模型。检查 manifest 里的参数后，加 `--execute` 才会运行：

```bash
node examples/live-model/run.mjs repair --provider YOUR_PROVIDER --model YOUR_MODEL_ID --execute
```

每次运行使用 `.workshop/live-model/` 下的新目录，不覆盖之前的实验。可以用 `--pi /path/to/pi` 指定命令位置，用 `--timeout 300` 修改每个阶段的进程等待上限，默认 180 秒。

执行真实模型会消耗账户额度。超时是进程等待上限，**不是 token 或金额硬上限，也不保证撤销已经发出的工具操作**。复杂修复可能多次调用模型。先跑一个小实验，观察实际用量，再扩大规模。实验只使用虚构资料；Pi 仍使用当前进程权限，工作目录不是沙箱。

脚本显式选择模型，关闭自动扩展、技能、模板与上下文文件发现，并拒绝项目资源加载。Skill 实验仅通过显式路径加载自己生成的教学技能。`--offline` 关闭启动时的自动网络更新，**不会关闭本次模型 API 请求**。这些选项减少环境干扰，但不声称完全复现供应商行为。

## 3. 实验 A：真实修复与独立验收

命令中的实验名使用 `repair`。它准备与第一章相同的订单程序，允许 `read/bash/edit/write`，要求模型只修复 `report.mjs`，保留数据与检查脚本，并运行检查。

独立验收在模型运行后进行：检查五组输入，比较保护文件，确认确实发生过工具调用。仅仅在回复中说“3500 分，已完成”不能通过程序检查。

观察三个问题：模型是否先读取业务规则和数据；是否根据失败反馈修正；最终说法是否与外部检查一致。若失败，先看轨迹中第一次出现错误证据的位置，再决定是任务说明、工具使用还是计算逻辑有问题。

实验执行的是生成的 JavaScript，检查器不是恶意程序隔离环境。它用于验证常规教学修复，不用于运行陌生攻击代码。

## 4. 实验 B：Skill 自动发现与显式调用

```bash
node examples/live-model/run.mjs skill --provider YOUR_PROVIDER --model YOUR_MODEL_ID --execute
```

脚本生成一份 `report-check` 技能和三条订单，执行两次独立会话：第一轮只提出报表核对任务，让模型自行选择是否读技能；第二轮显式使用 `/skill:report-check`。

技能正文包含独有标记 `REPORT-CHECKED-V1`，要求报告正确金额与笔数。结果记录是否有读取 `SKILL.md` 的工具调用、最终是否有标记，以及是否出现预期数字。显式调用会由宿主展开技能正文，不一定发生读取技能文件的工具调用，因此不能用同一项“读文件次数”给两种入口评分。

数字与标记检查只是粗筛：仍要人工检查“3500 分、2 笔 paid 订单”是否真的说对，不能把偶然包含数字当成正确计算。自动阶段没有选技能也会被如实记录，而不会直接归咎于加载器。可以在保持数据不变的前提下修改技能简介，再比较选择行为。

## 5. 实验 C：跨进程续接与新会话对照

```bash
node examples/live-model/run.mjs session --provider YOUR_PROVIDER --model YOUR_MODEL_ID --execute
```

这个实验使用随机生成的虚构任务代号，所有阶段禁用工具：

1. 第一个 Pi 进程接收代号和“整数分”约定，保存会话。
2. 第二个进程打开同一会话，询问之前确认的代号与单位。
3. 第三个进程创建全新会话，问同样的问题，但不提供代号。

预期第二阶段能依据历史回答，第三阶段不应获得原代号。脚本自动判断随机代号是否出现在续接回答、是否没有出现在新会话回答；单位是否正确、未知时是否诚实，需要人工复核。

这个实验验证会话历史的跨进程续接，不验证长期用户记忆，也不验证压缩后的召回质量。新会话答不出来不代表程序坏了，恰好可以帮助理解第四章的范围边界。

## 6. 阅读产物，而不是只看 PASS

| 文件 | 用途 |
| --- | --- |
| `manifest.json` | provider、model、Pi 版本、时间、命令与每阶段超时 |
| `*.events.jsonl` | Pi 实际事件流，包括工具请求与最终消息 |
| `*.stderr.txt` | 错误和诊断信息 |
| `*.session.jsonl` | Pi 会话持久化文件，与事件流格式不同 |
| `result.json` | 自动判定、最终回答、工具记录、用量及实验边界 |
| `workspace/` | 虚构输入与实际产物 |
| `expected.json` | 会话实验的随机代号，仅供验收 |

未认证、限流、网络错误、超时或不完整事件流都不应包装成成功。失败结果保留在原目录，不要覆盖后再只展示成功那一次。需要重跑时再次执行命令，会创建新目录。

日志可能包含模型返回的内容和本地路径，`.workshop/` 已被 Git 忽略；决定公开实验结果时，先审阅并仅导出相关证据，不上传认证目录。用量来自供应商报告，不能直接视为最终账单。

## 7. 进一步：手工观察上下文压缩

完成会话实验后，可以按[第三章练习](../../book/03-context-engineering.md)进行一段较长的交互对话，保存几个虚构约束，再手动 `/compact`。对比压缩摘要、保留段与旧原文，检查哪些事实仍能回忆，哪些必须重新读取。

不建议为了触发自动压缩而无目的制造几十万 token。短会话可能没有可压缩历史；这不是故障。实验目标是解释信息进入、保留与丢失的位置，而不是尽快耗尽窗口。

## 无账户时检查脚本本身

```bash
node examples/live-model/selftest.mjs
node examples/live-model/run.mjs repair --provider demo --model demo
node examples/live-model/run.mjs skill --provider demo --model demo
node examples/live-model/run.mjs session --provider demo --model demo
```

后三条均为 dry-run。这里的 `demo` 只是占位值，不能用于真实模型调用。CI 只运行这些本地检查，不注入模型凭证，也不产生模型费用。

[返回目录](../../README.md)
