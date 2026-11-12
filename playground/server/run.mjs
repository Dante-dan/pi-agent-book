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
import { estimateTokens } from './retrieval.mjs';
import { ROOT, VirtualFs } from './vfs.mjs';

export const LIMITS = {
  maxTurns: 12,
  maxSeconds: 120,
  displayChars: 4000,
};

// Pi 需要一个“配置目录”参数。这里给一个不存在的路径：禁用了扩展、技能、模板、
// 主题和上下文文件的发现之后，它不会被读取，更不会被写入。
const AGENT_DIR = '/nonexistent/pi-agent';

export { estimateTokens };

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
    // 状态栏借用的是 user 这个消息槽位，内容来自空间站自己，不是顾客说的话。
    return { role: 'user', status: text.startsWith('<agent_status>'), ...clip(text), tokens: estimateTokens(text) };
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

/** 往某个文件末尾追加一行的工具：记忆和规则都是这样攒起来的。 */
function appendTool(vfs, name, field, path, description) {
  return {
    name,
    label: name,
    description,
    parameters: Type.Object({ [field]: Type.String({ description: '一句话', maxLength: 300 }) }),
    async execute(_id, params) {
      const line = String(params[field] ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!line) throw new Error('内容不能为空');
      const abs = vfs.resolve(path);
      const previous = vfs.files.get(abs) ?? '';
      vfs.write(path, `${previous}- ${line}\n`);
      return { content: [{ type: 'text', text: `已写入 ${path}` }] };
    },
  };
}

/** 结构化的记忆卡片：除了事实本身，还要写清说的是谁、什么关系、怎么来的。 */
function cardTool(vfs, path) {
  const field = (description) => Type.String({ description, maxLength: 200 });
  return {
    name: 'remember_card',
    label: 'remember_card',
    description: '把一条长期有用的事实记成一张卡片。四项都必填。',
    parameters: Type.Object({
      person: field('这条事实说的是谁'),
      relationship: field('他和点餐顾客的关系；顾客本人就写“本人”'),
      fact: field('事实本身，一句话'),
      backstory: field('这句话是在什么情况下说的'),
    }),
    async execute(_id, params) {
      const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const cardLine = `- [人物：${clean(params.person)}｜关系：${clean(params.relationship)}] ${clean(params.fact)}（来历：${clean(params.backstory)}）`;
      const previous = vfs.files.get(vfs.resolve(path)) ?? '';
      vfs.write(path, `${previous}${cardLine}\n`);
      return { content: [{ type: 'text', text: `已写入 ${path}` }] };
    },
  };
}

/** 可执行的记忆：来访记录是带日期的数据，数数由程序来数。只做这一件事，不执行任何外来代码。 */
function countVisitsTool(vfs, path) {
  return {
    name: 'count_visits',
    label: 'count_visits',
    description: '精确统计这位顾客在某个月份的来访次数。数数请用它，不要自己数。',
    parameters: Type.Object({ month: Type.String({ description: '月份，格式 YYYY-MM，例如 2026-11', pattern: '^\\d{4}-\\d{2}$' }) }),
    async execute(_id, params) {
      const month = String(params.month ?? '');
      if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month 的格式应为 YYYY-MM');
      const state = JSON.parse(vfs.read(path));
      const count = state.visits.filter((visit) => String(visit.date).startsWith(month)).length;
      return { content: [{ type: 'text', text: `${state.customer} 在 ${month} 来访 ${count} 次。` }] };
    },
  };
}

/** 关系图谱的一条边。夜间建图时由主脑逐条抽出来。 */
function edgeTool(vfs, path) {
  const field = (description) => Type.String({ description, maxLength: 60 });
  return {
    name: 'add_edge',
    label: 'add_edge',
    description: '往关系图谱里记一条关系：from 和 to 之间是什么关系。每次只记一条。',
    parameters: Type.Object({ from: field('起点：人名、小组名或部门名'), relation: field('关系，例如 属于、并入、主管；有生效或取消日期就写进来'), to: field('终点：人名、小组名或部门名') }),
    async execute(_id, params) {
      const clean = (value) => String(value ?? '').replace(/[\s—→]+/g, ' ').trim().slice(0, 60);
      const [from, relation, to] = [clean(params.from), clean(params.relation), clean(params.to)];
      if (!from || !relation || !to) throw new Error('from、relation、to 都不能为空');
      const previous = vfs.files.get(vfs.resolve(path)) ?? '';
      vfs.write(path, `${previous}- ${from} —${relation}→ ${to}\n`);
      return { content: [{ type: 'text', text: `已写入 ${path}` }] };
    },
  };
}

/** 给一个文本块补上来历：它出自哪份文件的哪一节。 */
function labelTool(vfs, path) {
  return {
    name: 'label_chunk',
    label: 'label_chunk',
    description: '给一个文本块补一句来历说明。之后这句话会和正文一起建索引。',
    parameters: Type.Object({ id: Type.String({ description: '块的编号，例如 C3', pattern: '^[A-Za-z]\\d{1,3}$' }), context: Type.String({ description: '一句话：这一块出自哪份文件的哪一节', maxLength: 120 }) }),
    async execute(_id, params) {
      const id = String(params.id ?? '').trim();
      if (!/^[A-Za-z]\d{1,3}$/.test(id)) throw new Error('id 的格式应类似 C3');
      const context = String(params.context ?? '').replace(/\s+/g, ' ').replace(/[［］\[\]]/g, '').trim().slice(0, 120);
      if (!context) throw new Error('context 不能为空');
      const previous = (vfs.files.get(vfs.resolve(path)) ?? '').split('\n').filter((line) => line && !line.startsWith(`- [${id}] `));
      vfs.write(path, [...previous, `- [${id}] ${context}`].join('\n') + '\n');
      return { content: [{ type: 'text', text: `已写入 ${path}` }] };
    },
  };
}

/** 催单：每催一次，由代码在状态文件里记一笔。超过每天 3 次，对方会把本站拉黑。 */
function vendorTool(vfs, path) {
  return {
    name: 'call_vendor',
    label: 'call_vendor',
    description: '给商家打电话催货。每次调用就是真的打了一通电话。',
    parameters: Type.Object({ vendor: Type.String({ description: '商家名称', maxLength: 30 }) }),
    async execute(_id, params) {
      const vendor = String(params.vendor ?? '').replace(/\s+/g, '').slice(0, 30);
      if (!vendor) throw new Error('vendor 不能为空');
      const state = JSON.parse(vfs.files.get(vfs.resolve(path)) ?? '{"today": {}}');
      const count = (state.today[vendor] ?? 0) + 1;
      state.today[vendor] = count;
      vfs.write(path, JSON.stringify(state, null, 1) + '\n');
      const reply = count > 3 ? `已拨通${vendor}。对方：一天打了 ${count} 遍，说了在路上！以后别打了。（本站已被${vendor}拉黑）` : `已拨通${vendor}。对方：知道了，在路上。`;
      return { content: [{ type: 'text', text: reply }] };
    },
  };
}

/** 这座站的时钟。为了让每次发射都能复现，它不读真实时间：从任务设定的时刻起，每呼叫一次主脑走 9 秒。 */
function clockAt(base, call) {
  const [h, m, sec] = base.split(':').map(Number);
  const total = h * 3600 + m * 60 + sec + (call - 1) * 9;
  const two = (n) => String(n).padStart(2, '0');
  return `${two(Math.floor(total / 3600) % 24)}:${two(Math.floor(total / 60) % 60)}:${two(total % 60)}`;
}

/** 这次发给主脑的内容，有多少和上一次一字不差地重合在最前面：重合的部分才能复用缓存。 */
function measureCache(previous, wire, tokens) {
  if (!previous) return null;
  let cached = 0;
  let breakAt = wire.length;
  for (let i = 0; i < wire.length; i++) {
    if (previous[i] === wire[i]) {
      cached += tokens[i];
      continue;
    }
    breakAt = i;
    if (previous[i] !== undefined) {
      let same = 0;
      while (same < wire[i].length && wire[i][same] === previous[i][same]) same++;
      cached += Math.floor((tokens[i] * same) / Math.max(1, wire[i].length));
    }
    break;
  }
  const total = tokens.reduce((sum, n) => sum + n, 0);
  return { cached, total, breakAt, ratio: total ? cached / total : 0 };
}

function buildTools(names, vfs, stats, emit, user = null) {
  const all = {
    read: () => createReadToolDefinition(ROOT, { operations: vfs.readOps(), autoResizeImages: false }),
    write: () => createWriteToolDefinition(ROOT, { operations: vfs.writeOps() }),
    edit: () => createEditToolDefinition(ROOT, { operations: vfs.editOps() }),
    ls: () => createLsToolDefinition(ROOT, { operations: vfs.lsOps() }),
    check: () => checkTool(vfs, stats, emit),
    remember: () => appendTool(vfs, 'remember', 'note', `memory/${user ?? '未知顾客'}.md`, '把一条关于这位顾客的、以后还用得上的事实记进他的长期记忆。每次只记一条。'),
    add_rule: () => appendTool(vfs, 'add_rule', 'rule', 'kb/rules.md', '把一条适用于一类人的规则写进知识库，所有顾客共用。每次只写一条。'),
    remember_card: () => cardTool(vfs, `memory/${user ?? '未知顾客'}.md`),
    count_visits: () => countVisitsTool(vfs, `state/${user ?? '未知顾客'}.json`),
    add_edge: () => edgeTool(vfs, 'kb/graph.md'),
    label_chunk: () => labelTool(vfs, 'kb/labels.md'),
    call_vendor: () => vendorTool(vfs, 'state/calls.json'),
  };
  return names.map((name) => all[name]());
}

/** 工具说明书：模型实际收到的名称、描述与参数 Schema，供前端在运行前展示。 */
export function describeTools() {
  const noop = () => {};
  const stats = { checkPassed: false, checkFailures: 0 };
  return buildTools(['ls', 'read', 'write', 'edit', 'check', 'remember', 'add_rule', 'remember_card', 'count_visits', 'add_edge', 'label_chunk', 'call_vendor'], new VirtualFs(), stats, noop).map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
}

function reportIsCorrect(vfs) {
  try {
    const report = JSON.parse(vfs.files.get(`${ROOT}/report.json`) ?? 'null');
    return report?.paidCount === TRUTH.paidCount && report?.paidTotalCents === TRUTH.paidTotalCents;
  } catch {
    return false;
  }
}

const snapshotFiles = (vfs) => vfs.snapshot().map((f) => ({ path: f.path, bytes: f.bytes, ...clip(f.content) }));

/** 把任务定义展开成“这次发射要连着跑的几场对话”。第 01 站的任务只有一场。 */
function planSessions(mission, installed) {
  if (mission.sessions) return mission.sessions(installed);
  return [{ kind: 'chat', label: '', user: null, prompt: mission.prompt, tools: installed.map((id) => PARTS[id].tool).filter(Boolean), system: () => SYSTEM_PROMPT, puppet: mission.puppet(installed) }];
}

/**
 * 跑一场对话：一个全新的 Pi 会话，一个全新的上下文。虚拟文件是这次发射里唯一跨场保留的东西。
 * @returns {Promise<{finalText: string, transcript: string}>}
 */
async function runSession({ session, index, total, vfs, config, installed, hasLoop, stats, emit, run, lastTranscript }) {
  const context = { vfs, parts: installed, user: session.user, lastTranscript, emit };
  const prompt = typeof session.prompt === 'function' ? session.prompt(context) : session.prompt;
  // 先宣布“这一场开始了”，再组装系统提示：检索发生在组装的过程中，它属于这一场。
  emit('session_start', { index, total, kind: session.kind, label: session.label, user: session.user, prompt });
  const systemPrompt = session.system(context);
  const { runtime, model, label } = await buildModel(config, session.puppet);
  if (index === 0) run.modelLabel = label;

  let sentMessages = 0;
  let first = true;
  let sessionCalls = 0;
  let previousWire = null;
  // origin：改写出来的新消息对应原来的哪一条。前端靠它知道哪些方块被拿掉、哪些被改写。
  const shapeState = { origin: new WeakMap() };
  let seenMessages = 0;
  const reported = new Set();
  const loader = new DefaultResourceLoader({
    cwd: ROOT,
    agentDir: AGENT_DIR,
    settingsManager: SettingsManager.inMemory({}),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt,
    extensionFactories: [
      (pi) => {
        // 每次调用模型之前触发：这就是“主脑此刻看见的全部”。
        pi.on('context_with_system', (event) => {
          if (run.stopReason) return;
          run.modelCalls++;
          sessionCalls++;
          // Harness 在这里决定主脑到底看见什么：任务可以改写这一次要发出去的消息。
          const clock = session.clock ? clockAt(session.clock, sessionCalls) : null;
          const messages = session.shape ? session.shape({ messages: event.messages, call: sessionCalls, clock, parts: installed, vfs, state: shapeState }) : event.messages;
          const described = messages.map(describeMessage);
          const origin = messages.map((m) => shapeState.origin.get(m));
          const src = messages.map((m, i) => event.messages.indexOf(origin[i]?.from ?? m));
          const rewrites = [];
          src.forEach((index, i) => {
            if (!origin[i]?.rewrite || reported.has(index)) return;
            reported.add(index);
            rewrites.push({ index, block: described[i] });
          });
          const wire = described.map((m) => `${m.role}\u0001${m.text}\u0001${JSON.stringify(m.calls ?? m.tools ?? '')}`);
          const cache = measureCache(previousWire, wire, described.map((m) => m.tokens));
          previousWire = wire;
          if (cache) {
            stats.cache.cached += cache.cached;
            stats.cache.total += cache.total;
          }
          emit('context', {
            call: run.modelCalls,
            first,
            clock,
            cache,
            capacity: session.capacity ?? null,
            keep: session.shape ? src.filter((index) => index >= 0) : null,
            rewrites,
            total: described.reduce((sum, m) => sum + m.tokens, 0),
            sizes: described.map((m) => ({ role: m.role, tokens: m.tokens })),
            fresh: described.filter((m, i) => (src[i] < 0 ? first : src[i] >= seenMessages)).map((m, i) => ({ index: sentMessages + i, ...m })),
          });
          first = false;
          sentMessages = described.length;
          seenMessages = event.messages.length;
          // 舱满：这一次要发的内容超过了上下文舱的容量，发不出去。
          if (session.capacity && described.reduce((sum, m) => sum + m.tokens, 0) > session.capacity) {
            emit('overflow', { total: described.reduce((sum, m) => sum + m.tokens, 0), capacity: session.capacity });
            return run.abort('overflow');
          }
          if (session.shape) return { messages };
        });
      },
    ],
  });
  await loader.reload();

  const { session: pi } = await createAgentSession({
    cwd: ROOT,
    agentDir: AGENT_DIR,
    model,
    modelRuntime: runtime,
    thinkingLevel: 'off',
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(ROOT),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
    noTools: 'builtin',
    customTools: buildTools(session.tools, vfs, stats, emit, session.user),
  });
  run.abortCurrent = () => pi.abort().catch(() => {});

  let lastFiles = JSON.stringify(vfs.snapshot());
  const pendingArgs = new Map();
  let turnHadCalls = false;
  let turns = 0;
  let finalText = '';
  const unsubscribe = pi.subscribe((event) => {
    if (run.stopReason) return;
    switch (event.type) {
      case 'turn_start':
        turns++;
        stats.turns++;
        turnHadCalls = false;
        if (turns > LIMITS.maxTurns) return run.abort('max-turns');
        emit('turn_start', { turn: stats.turns });
        break;
      case 'message_end': {
        const message = event.message;
        if (message.role !== 'assistant') break;
        const described = describeMessage(message);
        if (message.stopReason === 'error' || message.errorMessage) stats.error = message.errorMessage ?? '模型调用失败';
        if (described.text) finalText = described.text;
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
          files: changed ? snapshotFiles(vfs) : null,
        });
        break;
      }
      case 'turn_end':
        emit('turn_end', { turn: stats.turns });
        // 没装“循环”零件：工具结果已经回舱，但不再呼叫主脑。这就是没有循环的 Harness。
        if (!hasLoop && turnHadCalls) run.abort('no-loop');
        break;
      default:
        break;
    }
  });

  try {
    await pi.prompt(prompt);
  } catch (error) {
    if (!run.stopReason) stats.error = stats.error ?? String(error?.message ?? error);
  } finally {
    unsubscribe();
    pi.dispose();
    run.abortCurrent = null;
  }
  emit('session_end', { index, total, kind: session.kind });
  if (run.stopReason === 'no-loop') finalText = '';
  return { finalText, transcript: `顾客说：${prompt}\n助手答：${finalText}` };
}

/**
 * @param {{missionId: string, parts: string[], config: object, emit: (type: string, data: object) => void, signal: AbortSignal}} options
 */
export async function runMission({ missionId, parts, config, emit, signal }) {
  const mission = getMission(missionId);
  if (!mission) throw new Error('没有这个任务');
  const fixed = mission.fixed ?? [];
  const installed = [...fixed, ...mission.allowed.filter((id) => parts.includes(id) && !fixed.includes(id))];
  const hasLoop = installed.includes('loop');
  const sessions = planSessions(mission, installed);

  const vfs = new VirtualFs(mission.files);
  const stats = { turns: 0, toolCalls: [], checkPassed: false, checkFailures: 0, finalText: '', answers: [], cache: { cached: 0, total: 0 }, error: null };
  const run = { stopReason: null, modelCalls: 0, modelLabel: '', abortCurrent: null };
  run.abort = (reason) => {
    if (!run.stopReason) run.stopReason = reason;
    run.abortCurrent?.();
  };
  const timer = setTimeout(() => run.abort('timeout'), LIMITS.maxSeconds * 1000);
  const onAbort = () => run.abort('client');
  signal.addEventListener('abort', onAbort, { once: true });

  emit('run_start', {
    mission: mission.id,
    mode: config.mode,
    prompt: mission.prompt,
    parts: installed,
    sessions: sessions.map((session) => ({ kind: session.kind, label: session.label })),
    files: snapshotFiles(vfs),
  });

  let lastTranscript = '';
  try {
    for (let index = 0; index < sessions.length; index++) {
      if (run.stopReason || stats.error) break;
      const session = sessions[index];
      const result = await runSession({ session, index, total: sessions.length, vfs, config, installed, hasLoop, stats, emit, run, lastTranscript });
      if (session.kind === 'chat') {
        stats.finalText = result.finalText;
        stats.answers.push(result.finalText);
        lastTranscript = result.transcript;
      }
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }

  // ---- 地面验收 ----
  const reportCorrect = reportIsCorrect(vfs);
  const interrupted = run.stopReason === 'timeout' || run.stopReason === 'client';
  let verdict;
  if (stats.error || interrupted) verdict = { ok: false, incident: null, line: null };
  else if (mission.judge({ stats, reportCorrect, finalText: stats.finalText, answers: stats.answers, vfs })) verdict = { ok: true, incident: null, line: mission.winLine };
  else {
    const incident = mission.diagnose(installed, stats);
    verdict = { ok: false, incident, line: failLineFor(mission, incident, reportCorrect) };
  }

  const stopText = { timeout: `超过 ${LIMITS.maxSeconds} 秒，已中止`, 'max-turns': `单场对话超过 ${LIMITS.maxTurns} 个回合，已强制停止`, client: '已停止', overflow: '上下文舱装不下了' };
  emit('run_end', {
    turns: stats.turns,
    modelCalls: run.modelCalls,
    model: run.modelLabel,
    toolCalls: stats.toolCalls.length,
    noLoop: run.stopReason === 'no-loop',
    stopped: stopText[run.stopReason] ?? null,
    error: stats.error,
    checkPassed: stats.checkPassed,
    checkFailures: stats.checkFailures,
    cacheRate: stats.cache.total ? stats.cache.cached / stats.cache.total : null,
    verdict,
    journal: vfs.journal,
  });
}
