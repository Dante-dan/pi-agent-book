// 一次运行：新建虚拟文件系统 + 模型运行时 + Pi 会话，跑完全部销毁。
// 运行之间不共享任何可变状态，所以多个用户同时使用不会互相看到数据。
import {
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  createAgentSession,
  createEditToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { PARTS, SYSTEM_PROMPT, TRUTH, failLineFor, getMission } from './levels.mjs';
import { buildModel } from './models.mjs';
import { ROOT, VirtualFs } from './vfs.mjs';

export const LIMITS = {
  maxTurns: 12,
  maxSeconds: 120,
  displayChars: 4000,
};

// Pi 需要一个“配置目录”参数。这里给一个不存在的路径：禁用了扩展、技能、模板、
// 主题和上下文文件的发现之后，它不会被读取，更不会被写入。
const AGENT_DIR = '/nonexistent/pi-agent';

/** 粗略估算 token 数，只用于画料仓的刻度。真实数字以供应商返回的 usage 为准。 */
export function estimateTokens(text) {
  let cjk = 0;
  for (const ch of text) if (ch.charCodeAt(0) > 0x2e7f) cjk++;
  return Math.ceil(cjk * 1.1 + (text.length - cjk) / 3.6);
}

function clip(text) {
  if (text.length <= LIMITS.displayChars) return { text, clipped: 0 };
  // 头尾都留：工具的截断提示在结果末尾，不能被页面这一层显示裁剪吃掉。
  const head = text.slice(0, LIMITS.displayChars - 800);
  const tail = text.slice(-700);
  const clipped = text.length - head.length - tail.length;
  return { text: `${head}\n\n……（页面省略了中间 ${clipped} 个字符，主脑收到的是完整内容）……\n\n${tail}`, clipped };
}

function blocksToText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text')
    .map((block) => block.text)
    .join('');
}

/** 把 Pi 的消息整理成前端料仓里的一块。 */
function describeMessage(message) {
  if (message.role === 'system') {
    const text = message.sections ? Object.values(message.sections).join('\n\n') : blocksToText(message.content);
    const tools = (message.toolsAdded ?? []).map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
    const toolTokens = estimateTokens(JSON.stringify(tools));
    return { role: 'system', ...clip(text), tokens: estimateTokens(text) + toolTokens, toolTokens, tools };
  }
  if (message.role === 'user') {
    const text = blocksToText(message.content);
    return { role: 'user', ...clip(text), tokens: estimateTokens(text) };
  }
  if (message.role === 'assistant') {
    const text = blocksToText(message.content);
    const calls = (message.content ?? []).filter((block) => block.type === 'toolCall').map((block) => ({ id: block.id, name: block.name, args: block.arguments }));
    return { role: 'assistant', ...clip(text), calls, tokens: estimateTokens(text + JSON.stringify(calls)) };
  }
  if (message.role === 'toolResult') {
    const text = blocksToText(message.content);
    return { role: 'toolResult', toolName: message.toolName, callId: message.toolCallId, isError: Boolean(message.isError), ...clip(text), tokens: estimateTokens(text) };
  }
  return { role: String(message.role), text: '', clipped: 0, tokens: 0 };
}

function checkTool(vfs, stats, emit) {
  return {
    name: 'check',
    label: 'check',
    description: '验收 report.json。不需要参数。写完或改完报告后调用，返回是否通过以及不通过的原因。',
    parameters: Type.Object({}),
    async execute() {
      let verdict;
      try {
        const report = JSON.parse(vfs.read('report.json'));
        if (report.paidCount !== TRUTH.paidCount) verdict = 'paidCount 与账本不符。提示：只有 status 为 paid 的订单才算收入。';
        else if (report.paidTotalCents !== TRUTH.paidTotalCents) verdict = 'paidTotalCents 与账本不符。提示：金额单位是分，只统计 paid 订单。';
      } catch (error) {
        verdict = error?.code === 'ENOENT' ? 'report.json 还不存在。' : 'report.json 不是合法的 JSON。';
      }
      const passed = !verdict;
      if (passed) stats.checkPassed = true;
      else {
        stats.checkPassed = false;
        stats.checkFailures++;
      }
      emit('check', { passed, detail: verdict ?? '与账本一致。' });
      return { content: [{ type: 'text', text: passed ? '✓ 验收通过：与账本一致。' : `✗ 验收不通过：${verdict}` }], details: { passed } };
    },
  };
}

function buildTools(names, vfs, stats, emit) {
  const all = {
    read: () => createReadToolDefinition(ROOT, { operations: vfs.readOps(), autoResizeImages: false }),
    write: () => createWriteToolDefinition(ROOT, { operations: vfs.writeOps() }),
    edit: () => createEditToolDefinition(ROOT, { operations: vfs.editOps() }),
    ls: () => createLsToolDefinition(ROOT, { operations: vfs.lsOps() }),
    check: () => checkTool(vfs, stats, emit),
  };
  return names.map((name) => all[name]());
}

/** 工具说明书：模型实际收到的名称、描述与参数 Schema，供前端在运行前展示。 */
export function describeTools() {
  const noop = () => {};
  const stats = { checkPassed: false, checkFailures: 0 };
  return buildTools(['ls', 'read', 'write', 'edit', 'check'], new VirtualFs(), stats, noop).map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
}

function reportIsCorrect(vfs) {
  try {
    const report = JSON.parse(vfs.files.get(`${ROOT}/report.json`) ?? 'null');
    return report?.paidCount === TRUTH.paidCount && report?.paidTotalCents === TRUTH.paidTotalCents;
  } catch {
    return false;
  }
}

/**
 * @param {{missionId: string, parts: string[], config: object, emit: (type: string, data: object) => void, signal: AbortSignal}} options
 */
export async function runMission({ missionId, parts, config, emit, signal }) {
  const mission = getMission(missionId);
  if (!mission) throw new Error('没有这个任务');
  const installed = mission.allowed.filter((id) => parts.includes(id));
  const toolNames = installed.map((id) => PARTS[id].tool).filter(Boolean);
  const hasLoop = installed.includes('loop');

  const vfs = new VirtualFs(mission.files);
  const stats = { turns: 0, toolCalls: [], checkPassed: false, checkFailures: 0, finalText: '', error: null };
  const { runtime, model, label } = await buildModel(config, mission.puppet(installed));

  let modelCalls = 0;
  let sentMessages = 0;
  let stopReason = null;
  const loader = new DefaultResourceLoader({
    cwd: ROOT,
    agentDir: AGENT_DIR,
    settingsManager: SettingsManager.inMemory({}),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: SYSTEM_PROMPT,
    extensionFactories: [
      (pi) => {
        // 每次调用模型之前触发：这就是“主脑此刻看见的全部”。
        pi.on('context_with_system', (event) => {
          if (stopReason) return;
          modelCalls++;
          const described = event.messages.map(describeMessage);
          emit('context', {
            call: modelCalls,
            total: described.reduce((sum, m) => sum + m.tokens, 0),
            sizes: described.map((m) => ({ role: m.role, tokens: m.tokens })),
            fresh: described.slice(sentMessages).map((m, i) => ({ index: sentMessages + i, ...m })),
          });
          sentMessages = described.length;
        });
      },
    ],
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: ROOT,
    agentDir: AGENT_DIR,
    model,
    modelRuntime: runtime,
    thinkingLevel: 'off',
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(ROOT),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
    noTools: 'builtin',
    customTools: buildTools(toolNames, vfs, stats, emit),
  });

  const abort = (reason) => {
    if (!stopReason) stopReason = reason;
    session.abort().catch(() => {});
  };
  const timer = setTimeout(() => abort('timeout'), LIMITS.maxSeconds * 1000);
  const onAbort = () => abort('client');
  signal.addEventListener('abort', onAbort, { once: true });

  let lastFiles = JSON.stringify(vfs.snapshot());
  const pendingArgs = new Map();
  let turnHadCalls = false;
  const unsubscribe = session.subscribe((event) => {
    if (stopReason) return;
    switch (event.type) {
      case 'turn_start':
        stats.turns++;
        turnHadCalls = false;
        if (stats.turns > LIMITS.maxTurns) return abort('max-turns');
        emit('turn_start', { turn: stats.turns });
        break;
      case 'message_end': {
        const message = event.message;
        if (message.role !== 'assistant') break;
        const described = describeMessage(message);
        if (message.stopReason === 'error' || message.errorMessage) stats.error = message.errorMessage ?? '模型调用失败';
        if (described.text) stats.finalText = described.text;
        turnHadCalls = described.calls.length > 0;
        emit('assistant', {
          turn: stats.turns,
          text: described.text,
          calls: described.calls,
          stopReason: message.stopReason,
          error: message.errorMessage ?? null,
          usage: message.usage ? { input: message.usage.input, output: message.usage.output, cacheRead: message.usage.cacheRead, cacheWrite: message.usage.cacheWrite } : null,
        });
        break;
      }
      case 'tool_execution_start':
        pendingArgs.set(event.toolCallId, event.args);
        emit('tool_start', { turn: stats.turns, id: event.toolCallId, name: event.toolName, args: event.args });
        break;
      case 'tool_execution_end': {
        const fullText = blocksToText(event.result?.content);
        const args = pendingArgs.get(event.toolCallId) ?? {};
        pendingArgs.delete(event.toolCallId);
        stats.toolCalls.push({ turn: stats.turns, name: event.toolName, args, isError: Boolean(event.isError), text: fullText });
        const files = JSON.stringify(vfs.snapshot());
        const changed = files !== lastFiles;
        lastFiles = files;
        emit('tool_end', {
          turn: stats.turns,
          id: event.toolCallId,
          name: event.toolName,
          isError: Boolean(event.isError),
          ...clip(fullText),
          tokens: estimateTokens(fullText),
          durationMs: event.durationMs ?? null,
          files: changed ? vfs.snapshot().map((f) => ({ path: f.path, bytes: f.bytes, ...clip(f.content) })) : null,
        });
        break;
      }
      case 'turn_end':
        emit('turn_end', { turn: stats.turns });
        // 没装“循环”零件：工具结果已经回舱，但不再呼叫主脑。这就是没有循环的 Harness。
        if (!hasLoop && turnHadCalls) abort('no-loop');
        break;
      default:
        break;
    }
  });

  emit('run_start', {
    mission: mission.id,
    mode: config.mode,
    model: label,
    prompt: mission.prompt,
    parts: installed,
    tools: session.getActiveToolNames(),
    files: vfs.snapshot().map((f) => ({ path: f.path, bytes: f.bytes, ...clip(f.content) })),
  });

  try {
    await session.prompt(mission.prompt);
  } catch (error) {
    if (!stopReason) stats.error = stats.error ?? String(error?.message ?? error);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    unsubscribe();
    session.dispose();
  }
  if (stopReason === 'no-loop') stats.finalText = '';

  // ---- 地面验收 ----
  const reportCorrect = reportIsCorrect(vfs);
  const interrupted = stopReason === 'timeout' || stopReason === 'client';
  let verdict;
  if (stats.error) verdict = { ok: false, incident: null, line: null };
  else if (interrupted) verdict = { ok: false, incident: null, line: null };
  else if (mission.judge({ stats, reportCorrect })) verdict = { ok: true, incident: null, line: mission.winLine };
  else {
    const rules = { blind: !installed.includes('read'), 'no-loop': !hasLoop, 'no-hands': !installed.includes('write'), 'no-verify': !installed.includes('check') };
    const incident = mission.incidents.find((id) => rules[id]) ?? 'miss';
    verdict = { ok: false, incident, line: failLineFor(mission, incident, reportCorrect) };
  }

  const stopText = { timeout: `超过 ${LIMITS.maxSeconds} 秒，已中止`, 'max-turns': `超过 ${LIMITS.maxTurns} 个回合，已强制停止`, client: '已停止' };
  emit('run_end', {
    turns: Math.min(stats.turns, LIMITS.maxTurns),
    modelCalls,
    toolCalls: stats.toolCalls.length,
    noLoop: stopReason === 'no-loop',
    stopped: stopText[stopReason] ?? null,
    error: stats.error,
    checkPassed: stats.checkPassed,
    checkFailures: stats.checkFailures,
    verdict,
    journal: vfs.journal,
  });
}
