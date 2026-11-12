# π 工坊

[pi.duanjl.com](https://pi.duanjl.com/) 的全部源码：一个让玩家扮演 **Harness 设计师**的 3D 小游戏。接任务、装零件、发射、查事故、解锁新零件，在失败里把 Agent 的概念一个个“逼”出来。

背后跑的是真实的 [Pi](https://github.com/earendil-works/pi) 运行时。这份文档主要写给想审计它的人。

## 它怎么保证安全

| 担心的事 | 做法 | 在哪儿看 |
| --- | --- | --- |
| Agent 碰到服务器的文件 | Pi 的 `read` / `write` 工具被接到一个内存里的 `Map` 上，路径越界一律拒绝。没有注册 `bash`，没有任何能执行命令的工具 | `server/vfs.mjs`、`server/run.mjs` |
| 用户之间串数据 | 每次发射新建独立的虚拟文件、模型运行时和 Pi 会话，跑完销毁，没有共享的可变状态 | `server/station3b.mjs` | 第 03 站后半（检索）的语料、任务与事故 |
| `server/retrieval.mjs` | 字面检索（BM25）、语义检索（概念向量）、倒数排名融合、关系图谱 |
| `server/run.mjs` |
| API key 被存下来 | key 只在一次请求的内存里：校验 → 交给运行时 → 请求结束即丢。不写盘，不进日志，请求体不记录 | `server/index.mjs`、`server/models.mjs` |
| key 被当成命令执行 | Pi 的配置解析会把 `!` 开头的值当 shell 命令、把 `$VAR` 当环境变量。这里用字符白名单挡在入口 | `server/models.mjs` |
| 借“自定义模型地址”探测内网 | 只接受 443 端口的公网 https 域名；连接建立前再查一次解析结果，内网、回环、链路本地、云元数据地址全部拒绝 | `server/netguard.mjs` |
| 报错把 key 回显出来 | 流回页面的每个事件都做一次字符串替换兜底 | `server/index.mjs` |
| 被刷 | 按访客 IP 限并发与频率；每场对话最多 12 回合，每次发射最多 120 秒 | `server/index.mjs`、`server/run.mjs` |
| 浏览器里的 key | 默认只在页面内存里。勾选“记住”时用你设的口令经 PBKDF2 + AES-GCM 加密后存 `localStorage`，不存明文 | `web/js/vault.js` |
| 页面被注入脚本 | CSP 只允许同源脚本和样式，没有内联脚本，没有第三方资源 | `server/index.mjs` |

部署层面：容器以非 root 运行，根文件系统只读，去掉全部 capability，不发布任何端口，唯一入口是 Cloudflare Tunnel。见 `compose.yml`。

发现问题请按仓库根目录的 `SECURITY.md` 报告。

## 没有 key 时跑的是什么

一个照着剧本输出的假模型（Pi 自带的测试用 provider）。**循环、工具、事件都是真的**，只有“模型想了什么”是写好的。剧本在 `server/levels.mjs` 和 `server/station3b.mjs`，每种零件组合对应一段。

有一样东西不是剧本：**检索**。第 03 站后半的每一次检索都是 `server/retrieval.mjs` 当场算出来的，木偶和真模型看到的是同一份结果。其中语义这一路用的是一张手工编的概念表，不是神经网络嵌入模型：它只有二十几个维度，胜在可以离线、可以复现，同义词认得、编号认不得这两个特点和真模型是一致的。

## 本地运行

需要 Node.js 22.19 或更高版本。

```bash
cd playground
npm ci --ignore-scripts
npm test          # 不需要模型账户，不发任何网络请求
npm start         # http://127.0.0.1:8787
```

## 目录

| 路径 | 内容 |
| --- | --- |
| `server/levels.mjs` | 任务、零件、事故与概念卡的全部数据 |
| `server/station3b.mjs` | 第 03 站后半（检索）的语料、任务与事故 |
| `server/retrieval.mjs` | 字面检索（BM25）、语义检索（概念向量）、倒数排名融合、关系图谱 |
| `server/run.mjs` | 一次发射：建虚拟文件、建会话、转发事件、地面验收 |
| `server/vfs.mjs` | 虚拟文件系统 |
| `server/models.mjs` | 模型配置校验与接入 |
| `server/netguard.mjs` | 出站连接防护 |
| `server/index.mjs` | HTTP 入口、限流、静态文件 |
| `server/content.mjs` | 把 `../book-v2/` 的书稿渲染成手册 |
| `web/js/station3d.js` | 3D 空间站（Three.js） |
| `web/js/app.js` | 游戏流程 |
| `web/vendor/three.min.js` | 自托管的 Three.js r187（MIT，许可见同目录） |
| `web/fonts/` | 自托管的 JetBrains Mono（OFL，许可见同目录） |

## 加一个新任务

先看 `../knowledge/` 里对应那一章的因果链，确认这次事故确实是原书推导里的一环。然后在 `server/levels.mjs` 里加一条 `MISSIONS`：写清楚地面要什么（`judge`）、能装哪些零件（`allowed`）、木偶在每种装配下怎么演（`puppet`）、每种失败对应哪个事故（`incidents`）。`npm test` 会检查解锁链是否自洽。
