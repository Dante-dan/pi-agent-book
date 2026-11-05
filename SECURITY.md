# 安全说明

[English](en/SECURITY.md)

## 依赖安全修订：2026-11-05

`examples/tool-contract` 已从 Pi 0.87.1 升级到 1.5.0。新锁文件使用 `undici 8.12.3`、`minimatch 11.0.3`、`brace-expansion 5.0.12`，消除本次审计发现的相关告警。漏洞包括 [undici 的 TLS 校验绕过](https://github.com/advisories/GHSA-2m5v-pch6-74hx)、[minimatch 的资源耗尽](https://github.com/advisories/GHSA-g3hv-75wg-m249)与 [brace-expansion 的资源耗尽](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)。

0.87.1 的 npm 包带有自己的 shrinkwrap；本次尝试的根级 `overrides` 未替换其中的易受攻击依赖，因此采用正式新版发布包，并重新运行工具契约实验。没有手工改写锁文件以掩盖告警。

从仓库根目录执行：

```bash
cd examples/tool-contract
npm ci --ignore-scripts
npm test
npm audit --audit-level=low
```

CI 同样执行审计。0 个已知漏洞只描述审计当时的这份依赖树，不代表所有软件或运行方式都没有风险。

## 书稿与历史模型实验

正文仍依据 Pi 0.87.1 的固定源码提交，原有模型实验脚本也仍检查该版本，以保留历史实验可复现性。它们的全局安装命令不会使用工具实验的新锁文件，不能把实验目录的审计结果推广到全局旧版 Pi。

不要将旧版复现环境用于生产或不可信资料。确需复现时，使用独立受限环境与虚构资料，并限制文件挂载、网络和凭证范围。面向实际任务的安装应另行选择已修复的版本；本书没有据此宣称全书与原模型实验已经在 1.5.0 上重新核验。

Pi 与教学验证器都不是恶意代码沙箱。`--ignore-scripts` 只限制依赖安装期间的生命周期脚本，不限制之后执行的程序。模型实验默认 dry-run，只有显式 `--execute` 才请求模型。

## 资料交付保护

调查实验的 `setup.py` 拒绝覆盖已有阶段文件，包括指向不存在目标的悬空符号链接，并用排他创建写入文件，避免预检查后出现的文件被覆盖。目标目录由使用者选择；这不是针对同权限恶意进程的完整文件系统沙箱。原始 CSV、题目阶段和答案分离规则保持不变。

实验日志保存在 Git 忽略的 `.workshop/`，可能包含本地路径及模型内容。公开前审阅需要分享的部分，不公开认证目录或真实业务资料。
