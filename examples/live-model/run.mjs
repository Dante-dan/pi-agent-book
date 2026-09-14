// 需要已登录的 Pi 与模型账户；默认 dry-run 不发模型请求。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { gradeEvents } from './support.mjs';

const raw = process.argv.slice(2);
const lab = raw.shift();
const options = { execute: false, pi: 'pi', timeout: 180, provider: '', model: '' };
const valued = new Set(['pi', 'timeout', 'provider', 'model']);
for (let i = 0; i < raw.length; i++) {
  const key = raw[i].replace(/^--/, '');
  if (key === 'execute') options.execute = true;
  else if (key === 'dry-run') options.execute = false;
  else if (valued.has(key) && raw[i + 1] && !raw[i + 1].startsWith('--')) options[key] = raw[++i];
  else throw new Error(`未知或缺少值的选项：${raw[i]}`);
}
if (!['repair', 'skill', 'session'].includes(lab) || !options.provider || !options.model) {
  console.error('用法：node examples/live-model/run.mjs repair|skill|session --provider <provider> --model <model-id> [--execute] [--timeout 180] [--pi /path/to/pi]\n默认只准备目录与命令；加 --execute 才调用模型。');
  process.exit(2);
}
const timeout = Number(options.timeout);
if (!Number.isFinite(timeout) || timeout < 10 || timeout > 1800) throw new Error('timeout 必须为 10–1800 秒');
const base = fileURLToPath(new URL('.', import.meta.url));
const book = resolve(base, '../..');
const runs = join(book, '.workshop/live-model');
mkdirSync(runs, { recursive: true });
const runDir = mkdtempSync(join(runs, `${lab}-`));
const workspace = join(runDir, 'workspace');
mkdirSync(workspace);
const common = ['--mode', 'json', '-p', '--offline', '--no-approve', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--provider', options.provider, '--model', options.model];
const phases = [];
const metadata = { lab, createdAt: new Date().toISOString(), provider: options.provider, model: options.model, timeoutSecondsPerPhase: timeout, executed: options.execute, phases: [] };
const phase = (id, prompt, extra = [], session = id) => phases.push({ id, args: [...common, '--session', join(runDir, `${session}.session.jsonl`), ...extra, '--', prompt] });
let token;
if (lab === 'repair') {
  cpSync(join(base, '../order-report/starter'), workspace, { recursive: true });
  phase('repair', '修复当前目录 report.mjs。只有 status 为 paid 的订单计入汇总，amountCents 单位是分。先读文件，不得修改 orders.json 和 check.mjs。运行 node check.mjs，再报告真实结果。', ['--tools', 'read,bash,edit,write']);
} else if (lab === 'skill') {
  const skillDir = join(runDir, 'skills/report-check');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: report-check\ndescription: 核对报表金额汇总时使用，提供口径与检验步骤。\n---\n\n读取当前目录 orders.json，金额单位是整数分。只把 paid 订单计入收入。独立加总并在最终回答中报告金额和笔数。最后原样写出 REPORT-CHECKED-V1，表示使用了本流程。\n');
  cpSync(join(base, '../order-report/starter/orders.json'), join(workspace, 'orders.json'));
  const skillArgs = ['--tools', 'read', '--skill', skillDir];
  phase('automatic', '请核对当前目录订单报表的金额汇总，说明统计口径和结果。', skillArgs);
  phase('explicit', '/skill:report-check 核对当前目录的订单数据。', skillArgs);
} else {
  token = `KITE-${randomBytes(6).toString('hex')}`;
  writeFileSync(join(runDir, 'expected.json'), JSON.stringify({ token, unit: '整数分' }, null, 2));
  phase('remember', `这是虚构记忆实验。本次任务代号是 ${token}，金额单位是整数分。请原样复述代号与金额单位，本轮不做其他事。`, ['--no-tools'], 'shared');
  phase('resume', '之前明确确认的任务代号和金额单位是什么？根据会话记录回答；不知道就明确说不知道，不猜测。', ['--no-tools'], 'shared');
  phase('fresh', '之前明确确认的任务代号和金额单位是什么？根据会话记录回答；不知道就明确说不知道，不猜测。', ['--no-tools'], 'fresh');
}
metadata.phases = phases.map(p => ({ id: p.id, command: options.pi, args: p.args }));
writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(metadata, null, 2));
console.log(`实验目录：${runDir}`);
if (!options.execute) {
  console.log('DRY RUN：已准备虚构数据和 manifest.json；未调用 Pi 或模型。加 --execute 执行。');
  process.exit(0);
}
const version = spawnSync(options.pi, ['--version'], { encoding: 'utf8', timeout: 15000 });
if (version.status !== 0) throw new Error(`Pi 无法运行：${version.error?.message ?? version.stderr}`);
metadata.piVersion = version.stdout.trim();
if (metadata.piVersion !== '0.85.1') throw new Error(`本实验固定 Pi 0.85.1，实际 ${metadata.piVersion}；请对齐版本后运行。`);
const results = [];
for (const current of phases) {
  console.log(`开始 ${current.id}：单阶段进程超时 ${timeout} 秒；可能产生模型费用。`);
  const result = spawnSync(options.pi, current.args, { cwd: workspace, encoding: 'utf8', timeout: timeout * 1000, maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(join(runDir, `${current.id}.events.jsonl`), result.stdout ?? '');
  writeFileSync(join(runDir, `${current.id}.stderr.txt`), result.stderr ?? '');
  const observation = gradeEvents(result.stdout ?? '');
  results.push({ phase: current.id, exitCode: result.status, signal: result.signal, processError: result.error?.message ?? null, ...observation });
  if (result.status !== 0 || !observation.finished || observation.modelError || observation.invalidLines) break;
}
const allRunsFinished = results.length === phases.length && results.every(r => r.exitCode === 0 && r.finished && !r.modelError && !r.invalidLines);
const report = { lab, allRunsFinished, results, accepted: false };
if (lab === 'repair') {
  const verification = spawnSync(process.execPath, [join(base, '../order-report/verify.mjs'), workspace], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  report.externalCheck = { exitCode: verification.status, stdout: verification.stdout, stderr: verification.stderr };
  report.accepted = allRunsFinished && verification.status === 0 && results.some(r => r.tools.length > 0);
} else if (lab === 'skill') {
  report.observations = results.map(r => ({ phase: r.phase, skillFileRead: r.tools.some(t => t.name === 'read' && t.successful && /SKILL\.md$/.test(t.args.path ?? '')), markerPresent: r.finalText.includes('REPORT-CHECKED-V1'), expectedNumbersPresent: /3500/.test(r.finalText) && /2|两|二/.test(r.finalText) }));
  report.accepted = allRunsFinished && report.observations.length === 2 && report.observations[1].markerPresent && report.observations[1].expectedNumbersPresent;
  report.gradingLimit = '数字与标记仅作粗筛；人工核对 paid 口径、金额与笔数。自动未选 Skill 是观察结果，不等于加载器失效。';
} else {
  report.resumedTokenPresent = results.find(r => r.phase === 'resume')?.finalText.includes(token) ?? false;
  report.freshTokenAbsent = !(results.find(r => r.phase === 'fresh')?.finalText.includes(token) ?? true);
  report.accepted = allRunsFinished && report.resumedTokenPresent && report.freshTokenAbsent;
  report.gradingLimit = '检验随机代号的跨进程续接与新会话隔离；不证明长期用户记忆或压缩质量。金额单位与诚实表达请人工复核。';
}
metadata.completedAt = new Date().toISOString();
writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(metadata, null, 2));
writeFileSync(join(runDir, 'result.json'), JSON.stringify(report, null, 2));
console.log(`${report.accepted ? 'PASS' : 'NOT PASSED'}：查看 result.json 与事件原文。日志仅保存在 .workshop，不会默认提交。`);
process.exitCode = report.accepted ? 0 : 1;
