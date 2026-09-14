# 第六章　扩展：把自己的规则接入 Pi 的运行过程

前面几章解释了 Pi 怎样接收任务、准备上下文、调用工具以及保存会话。现在考虑一个更具体的需求：团队希望每次生成报告前加载本月的数据字典，查询客户信息时只能访问只读接口，并且在退出后仍能恢复报告进度。

这些要求包含三类不同的改变。数据字典影响模型看到什么；只读查询决定模型可以做什么；进度恢复决定应用怎样延续工作。只写一段“请遵守规则”的提示词，很难同时解决它们。直接修改 Pi 内核又会让维护者承担合并上游更新的成本。

Pi 给出的入口是 **Extension，扩展**：由宿主加载的一段 TypeScript 程序。它可以注册工具、订阅运行事件、保存自定义状态，也可以提供命令和界面。扩展不是另一个独立 Agent。它通常不负责重新实现模型循环，而是在已有循环的具体位置接入应用逻辑。

## 6.1 先选择最小的改变位置

假设你希望 Pi 输出报告时采用公司的排版规范。如果只是固定章节和语气，提示模板就够了；如果还需要说明数据来源、计算口径和检查步骤，可以写成 Skill；如果必须调用专用数据库、检查每一次工具调用，或者维护跨轮次的程序状态，就需要扩展。

三者解决的问题不同。模板是可复用的输入文本；Skill 是按需读取的操作知识；扩展是宿主真正执行的代码。把一个校验条件写进 Skill，模型可能理解并遵守；把同一条件写进工具执行函数，可以在条件不满足时直接拒绝执行。这解释了为什么可靠应用往往同时使用自然语言与程序，而不要求某一种机制包办所有事情。

Pi 的工具注册接口包括名称、说明、参数模式和执行函数，也允许指定呈现方式与执行模式。模型主要需要知道工具的用途、参数及结果；终端用户还需要进度和可读的展示。两类需求被放在同一个工具定义的不同字段中。[源码：ToolDefinition](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/extensions/types.ts#L449)

这里的设计价值在于：扩展作者可以拥有领域决策，Pi 继续负责运行这些决策所需的公共设施。对报告应用而言，“怎样计算收入”属于业务，“怎样把工具结果送回模型”属于宿主。

## 6.2 事件是生命周期中的插座

“事件”可以理解为运行过程发出的通知。例如，模型准备调用工具时，宿主通知扩展：“即将调用这个工具，参数在这里。”有的通知仅用于观察，有的允许返回修改结果或阻止动作。

```mermaid
flowchart TD
    A[加载扩展并注册处理函数] --> B[session_start：恢复会话状态]
    B --> C[用户提交任务]
    C --> D[before_agent_start：准备本次任务]
    D --> E[context：整理本次模型调用的消息]
    E --> F[调用模型]
    F --> G{模型是否请求工具}
    G -- 是 --> H[tool_call：检查调用]
    H --> I[执行工具并产生结果]
    I --> J[tool_result：处理结果]
    J --> E
    G -- 否 --> K[本轮循环结束]
```

这是一张省略重试、压缩和排队消息的机制图，不是完整事件时序规范。它首先帮助我们区分两个常被混淆的时点：`before_agent_start` 位于用户任务进入循环之前；`context` 位于每次模型调用之前。一个用户任务可能调用模型很多次，因此也可能触发很多次 `context`。[源码：事件定义](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/extensions/types.ts#L687)

例如，本月数据字典可以在任务开始时检索一次，再由后续上下文处理选择必要内容。若每次 `context` 都重新下载整份字典，工具往返越多，网络开销越大。事件位置会直接影响成本，不能只看名字是否顺眼。

下面是机制伪代码，`retrieveDictionary` 等函数需要应用自己实现：

```text
任务开始时：
    taskDictionary = retrieveDictionary(任务涉及的月份)
    taskDictionary = 保留来源、版本和必要字段(taskDictionary)

每次构造模型上下文时：
    messages = 当前消息的副本
    messages = 去除本扩展上次插入的同类临时块(messages)
    messages = 插入标记为参考资料的数据字典(messages)
    返回 messages
```

先去重再插入，是为了防止上下文在循环中不断膨胀。保留资料身份，是为了让数据字典中的文字继续作为资料，而不是升级成能够覆盖用户要求的指令。实际实现还必须使用合法的消息类型，并维持工具调用与工具结果的对应关系。

Pi 的 `emitContext` 会先复制消息，再依次调用扩展处理函数；后一个处理函数接收前一个处理函数处理后的消息。因此两个扩展的修改会组合，也可能冲突。这种修改作用于发送给模型的消息视图，不等同于删除磁盘上的历史记录。[源码：emitContext](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/extensions/runner.ts#L1034)

## 6.3 注册工具：把业务接口交给模型

继续使用报告应用。我们可以提供一个 `lookup_metric` 工具：输入指标名称和月份，返回定义、来源和生效日期。它比允许模型任意查询数据库更容易理解，也更容易校验。

下面故意使用伪代码，以突出接口责任，而不是让读者直接复制一个并不存在的数据库客户端：

```text
registerTool({
    name: "lookup_metric",
    description: "查询指定月份生效的指标定义，不修改数据",
    parameters: {
        metric: 必填字符串,
        month: YYYY-MM 格式字符串
    },
    execute(callId, params, signal, onUpdate, context):
        校验月份格式与允许访问的业务范围
        result = 查询服务(metric, month, cancellation=signal)
        return {
            content: [给模型的简短定义、来源与适用月份],
            details: {schemaVersion: 1, 完整结构化元数据}
        }
})
```

真实 API 使用参数模式描述输入，执行函数还接收工具调用标识、取消信号、进度回调及扩展上下文。调用标识适合关联日志；取消信号需要继续传给网络客户端，才能让用户取消真正停止底层工作；进度回调可以报告“正在查询”，但不能把进度描述冒充最终结果。[源码：工具接口及执行参数](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/extensions/types.ts#L449)

`content` 和 `details` 也不要混为一谈。前者承载工具交给模型的内容，后者适合存放扩展恢复状态或界面展示需要的结构化数据。不能以为把来源只放在 `details` 里，模型就一定会引用它；模型需要据此判断的字段，应出现在可见内容中。敏感字段则应在查询服务端就限制返回，不应仅靠界面隐藏。

在本书固定版本中，`registerTool()` 不只可在扩展初始化时调用，也可在启动之后注册；工具列表会在当前会话更新。它提供动态扩展的基础，也支持第五章介绍的追加式工具加载；“先展示哪个工具组，再发现哪些工具”的业务发现流程仍需应用设计。[官方说明：动态注册](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/extensions.md#L1375)

## 6.4 检查工具调用，不等于获得沙盒

如果报告尚未核对，应用希望禁止发布，可以在 `tool_call` 检查调用，并返回 `{ block: true, reason: "尚未通过核对" }`。Pi 按顺序执行相关处理函数，遇到阻止结果便返回。[源码：emitToolCall](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/extensions/runner.ts#L982)

不过，策略是否完整，取决于它覆盖了哪些行动入口。你只拦截 `write`，模型仍可能通过 `bash` 写文件；你拦截某个发布工具，另一个扩展可能直接调用发布接口。一个字符串黑名单也难以可靠理解 shell 的全部语义。因此，事件钩子适合表达业务策略，操作系统、容器、独立服务的权限才适合承担强隔离。

还有一个细节：`tool_call` 允许原地修改输入，后续处理函数会看到修改后的参数；源码明确写明，修改之后不会再执行一次参数模式校验。如果扩展把月份改成不存在的格式，不能期待宿主自动替它兜底。能避免改参时尽量避免；确需修改时，由修改者重新验证。[源码：ToolCallEvent 注释](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/extensions/types.ts#L939)

Pi 本身没有内建沙盒，扩展与内置工具以启动 Pi 的用户权限运行。项目可信设置控制的是是否加载项目中的配置、资源和扩展，不是运行后的文件或网络访问边界。项目获得信任，也不意味着项目中的每段文字和每条构建命令都安全。[官方安全边界](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/security.md#L1)

对月报应用，一个较稳妥的分工是：查询服务使用只读凭据；生成报告在工作目录进行；发布服务单独验证目标位置、审核状态和请求身份。Pi 扩展负责把这些入口接起来，而不是成为权限体系唯一的守门人。

### 当多个工具同时行动时

假设模型同一次响应中请求“检查表一”和“检查表二”。在本书版本的默认并行工具执行模式下，同一响应的工具调用先依次进行预检，然后才并发执行。这意味着表二的 `tool_call` 检查不能假定已经看到了表一的结果。处理函数访问的会话状态会同步到当前助手调用消息，但并不保证包含同批兄弟调用的结果。[官方说明：工具预检与并行](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/extensions.md#L778)

如果两个检查只读不同文件，这通常没有问题；如果它们共同修改一个“已完成数量”，就需要程序级同步或顺序执行。更危险的情况是模型同时请求“检查报告”和“发布报告”：发布检查不能把“另一项检查已经排队”当成“检查已经通过”。应让发布服务验证已经存在的验收记录，或把依赖关系拆成两轮。工具定义提供 `executionMode` 选择，但业务依赖仍需应用明确表达。

这也解释了为什么进度计数器不是可靠的发布凭据。“完成了三项”不能证明是哪三项、对应哪个输入、由哪个版本的校验器生成。更可靠的记录应带上检查项标识和输入摘要，发布时逐项核对。

### 错误处理也是扩展契约

扩展抛错时，不能假定所有事件都会用同一种方式恢复。比如 `emitContext` 会记录处理函数错误并继续处理，而工具调用检查承担阻止动作的责任。对应用关键的条件，最好返回可解释的失败，配合工具或服务端约束，不要依赖某段上下文注入“应该总能运行成功”。

日志同样需要区分“注册成功”“开始执行”“执行成功”和“验收通过”。一个网络查询开始的通知只能证明代码走到了那一步；一条结束事件也可能携带错误。为每次调用保留调用标识、简短状态及证据位置，有助于查清中断、重复执行和部分完成的问题。完整客户资料和系统提示词不应为了方便调试就全部复制进日志。

## 6.5 状态恢复：不要只保存一个内存变量

报告已经核对到第三张表，退出 Pi 后重新打开，不应该又从第一张表开始。如果进度只存在 `let completedTables = []` 中，进程退出就会消失。

Pi 提供 `appendEntry(customType, data)` 保存自定义条目。这些条目不会自动成为模型上下文。需要模型知道进度时，扩展应另行构造简短消息；需要程序恢复时，则读取条目重建状态。[源码：自定义条目的语义](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/session-manager.ts#L101)

恢复时还有“读哪个历史”的问题。假设你在时间点甲完成了表一，随后完成表二，又从甲创建另一条分支重新计算。如果扫描整个会话文件并取最后一条进度，就可能把另一分支的表二状态带过来。与对话分支相关的数据，应沿当前分支恢复。

```text
restore(context):
    state = 初始状态
    for entry in context.sessionManager.getBranch():
        if entry 是本扩展的状态记录:
            state = 按 schemaVersion 解析并更新(state, entry)
    return state

session_start 时：state = restore(context)
session_tree 时：state = restore(context)
成功完成一个检查步骤后：保存新的状态记录
```

Pi 官方的待办扩展示例采用另一种相近方式：把结构化状态放在工具结果的 `details` 中，在 `session_start` 和 `session_tree` 时扫描当前分支恢复。它展示了“从历史重建状态”如何与分支配合。[源码：待办状态恢复](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/todo.ts#L108)

恢复会话状态不等于撤销外部副作用。若某个报告已经发送，切换到发送前的分支不会把邮件收回。状态中应保留外部操作标识，重试时向服务确认是否执行过。涉及发布、付款或写数据库的流程，还需要服务端幂等性：相同业务请求重复提交，不会重复产生效果。

本书版本的会话替换生命周期也值得牢记：新建、恢复或 fork 会结束旧扩展实例，再为替换后的会话加载扩展，并通过 `session_start` 的 `reason` 告知原因。清理连接放在 `session_shutdown`，恢复放在 `session_start`；不要持有旧会话的上下文继续写入。[官方说明：会话替换](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/extensions.md#L432)

## 6.6 从个人扩展到应用宿主

个人扩展可以放在 `~/.pi/agent/extensions/`，项目扩展可以放在 `.pi/extensions/`。当你想把扩展、Skill、模板与主题一起分享时，可将它们组织成 Pi Package，通过 npm 或 Git 分发。包只是资源组合与分发方式，并不会自动增加隔离层。固定包版本或 Git 提交，才能知道某次运行究竟用了哪一套行为。[官方说明：包管理](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/packages.md#L5)

如果终端不适合最终用户，Pi 还有两个应用集成入口。**SDK** 是进程内的程序接口，Node.js 应用通过 `createAgentSession()` 创建会话、订阅事件并调用 `session.prompt()`。它可以提供工具、资源加载器和会话管理器。**RPC** 则启动 `pi --mode rpc` 子进程，经标准输入输出交换 JSON 消息，适合用其他语言编写宿主界面。[源码：SDK 入口](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/sdk.ts#L39)

RPC 的基本形状如下，发送记录末尾需要一个实际的 LF 换行：

```json
{"id":"report-1","type":"prompt","message":"检查本月报告的汇总口径"}
```

宿主可能先收到命令接受响应，然后继续收到 Agent 事件。`success: true` 表示这条输入已被接受、排队或处理，不代表报告正确完成。应用应跟踪后续事件、实际产物及验收结果，不能一收到接受响应便把界面变成“任务成功”。协议使用严格的 LF 分帧，不能随意把 JSON 字符串中的其他 Unicode 分隔字符当作消息边界。[官方协议：prompt 与分帧](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/rpc.md#L25)

## 6.7 练习：设计一个可恢复的报告检查器

选择一个只有三张表的练习报告，先写设计说明，不需要接真实数据库。工具输入应有表名和检查项，结果应分别包含模型可读的结论及结构化证据；扩展状态应记录数据版本、已完成检查和外部任务标识。

验收时走四条路径：正常检查三张表；第二张表失败后重试；退出后恢复；回到检查第一张表后的分支。四条路径都必须能解释“目前认为完成了什么，证据在哪里”。再加一条对抗性情况：历史里记录检查通过，但原始数据已经更新。合理行为是重新核对或明确提示证据过期，不能仅凭旧进度宣布通过。

最后检查你的设计是否把业务判断、状态持久化、模型可见信息和系统权限分开。能够指出每项责任落在哪一层，比堆出很多事件处理函数更接近掌握 Pi 的扩展能力。

[上一章](05-tools.md) · [返回目录](../README.md) · [下一章](07-general-agent.md)
