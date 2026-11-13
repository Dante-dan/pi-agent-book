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
import { SLOTS, STOCK } from './station4.mjs';
import { SCREEN } from './station6.mjs';
import { ALLOWED_HOSTS } from './stationS.mjs';

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
    return { role: 'user', status: text.startsWith('<agent_status>'), gate: text.startsWith('［完成闸门］'), ...clip(text), tokens: estimateTokens(text) };
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

// ---------- 第 04 站的工具：每一个都有“前任设计师的版本”和“修好的版本” ----------
const fail = (message) => {
  throw new Error(message);
};

function stockTools(spec) {
  const lookup = {
    name: 'lookup_stock',
    label: 'lookup_stock',
    description: spec ? '按货位码查某个货位上还剩多少件货。只接受货位码，不接受商品名；不知道货位码时，先用 find_slot 按商品名查。货位不存在时会明确告诉你。' : '查库存。',
    parameters: spec ? Type.Object({ code: Type.String({ description: '货位码：一个大写字母、一个连字符、一个数字，例如 C-2', maxLength: 20 }) }) : Type.Object({ q: Type.String({ description: '查询', maxLength: 40 }) }),
    async execute(_id, params) {
      const code = String(params.code ?? params.q ?? '').trim();
      if (!/^[A-Z]-\d$/.test(code)) fail(spec ? `“${code}”不是货位码。货位码形如 C-2（字母-数字）。如果你手里只有商品名，请先调用 find_slot。` : '查询失败。');
      if (!(code in STOCK)) fail(spec ? `货位 ${code} 不存在。请用 find_slot 确认货位码。` : '查询失败。');
      return { content: [{ type: 'text', text: spec ? `货位 ${code} 现有库存 ${STOCK[code]} 件。` : String(STOCK[code]) }] };
    },
  };
  const find = {
    name: 'find_slot',
    label: 'find_slot',
    description: spec ? '按商品名查它放在哪个货位，返回货位码。拿到货位码后才能用 lookup_stock 查数量。商品名要和货架标签一致，例如“薯片”。' : '查找。',
    parameters: spec ? Type.Object({ item: Type.String({ description: '商品名，例如 薯片', maxLength: 20 }) }) : Type.Object({ q: Type.String({ description: '查询', maxLength: 40 }) }),
    async execute(_id, params) {
      const item = String(params.item ?? params.q ?? '').trim();
      if (!(item in SLOTS)) fail(spec ? `没有名叫“${item}”的商品。现有：${Object.keys(SLOTS).join('、')}。` : '查询失败。');
      return { content: [{ type: 'text', text: spec ? `${item}在货位 ${SLOTS[item]}。` : SLOTS[item] }] };
    },
  };
  return { lookup, find };
}

/** 改文字。faithful 为假时，入口有一道“清洗”，把弯引号悄悄换成直引号，而且不告诉任何人。 */
function replaceTool(vfs, faithful) {
  const scrub = (value) => (faithful ? value : value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
  return {
    name: 'replace_text',
    label: 'replace_text',
    description: '把文件里的一段文字换成另一段。old 必须和文件里的内容一字不差，并且在文件里恰好出现一次。',
    parameters: Type.Object({ path: Type.String({ description: '文件路径', maxLength: 100 }), old: Type.String({ description: '要被替换的原文', maxLength: 300 }), new: Type.String({ description: '替换成的新文字', maxLength: 300 }) }),
    async execute(_id, params) {
      const content = vfs.read(String(params.path ?? ''));
      const before = scrub(String(params.old ?? ''));
      const after = scrub(String(params.new ?? ''));
      if (!before) fail('old 不能为空。');
      const count = content.split(before).length - 1;
      if (count === 0) fail(`没有找到：${before}`);
      if (count > 1) fail(`“${before}”在文件里出现了 ${count} 次，必须恰好出现一次。请多带一点上下文。`);
      vfs.write(String(params.path), content.replace(before, after));
      return { content: [{ type: 'text', text: `已替换 1 处。` }] };
    },
  };
}

/** 读长文档，一次最多 200 个字。ruler 为假时悄悄截断；为真时说明全文多长、给的是哪一段、怎么接着读。 */
function docTool(vfs, ruler) {
  const LIMIT = 200;
  return {
    name: 'read_doc',
    label: 'read_doc',
    description: ruler ? `读一份文档。一次最多返回 ${LIMIT} 个字；如果没读完，返回的末尾会写明全文长度和下一段的 offset，用它接着读。` : '读一份文档，返回它的内容。',
    parameters: ruler ? Type.Object({ path: Type.String({ description: '文件路径', maxLength: 100 }), offset: Type.Optional(Type.Number({ description: '从第几个字开始读，默认 0', minimum: 0 })) }) : Type.Object({ path: Type.String({ description: '文件路径', maxLength: 100 }) }),
    async execute(_id, params) {
      const content = vfs.read(String(params.path ?? ''));
      const offset = ruler ? Math.max(0, Math.floor(Number(params.offset ?? 0)) || 0) : 0;
      const piece = content.slice(offset, offset + LIMIT);
      const end = offset + piece.length;
      const tail = !ruler ? '' : end < content.length ? `\n\n［已截断：全文 ${content.length} 个字，这一次是第 ${offset} 到 ${end} 个字。接着读请用 offset=${end}］` : `\n\n［已到文末：全文 ${content.length} 个字］`;
      return { content: [{ type: 'text', text: piece + tail }] };
    },
  };
}

/**
 * 付货款。这个接口“今天不太稳”：每个订单的第一次请求，钱出去了，但回音丢了。
 * idem 为假时没有订单号，系统认不出重复请求；为真时同一个订单号只扣一次钱。
 */
function payTool(vfs, path, idem) {
  return {
    name: 'pay_vendor',
    label: 'pay_vendor',
    description: idem ? '给商家付一笔货款。必须带订单号：同一个订单号重复请求不会重复扣款，系统会告诉你这一笔是否已经付过。请求超时后，用同一个订单号重试是安全的。' : '给商家付一笔货款。',
    parameters: idem
      ? Type.Object({ vendor: Type.String({ description: '商家名称', maxLength: 30 }), amount: Type.Number({ description: '金额，单位元', minimum: 0, maximum: 100000 }), order_id: Type.String({ description: '订单号，例如 PO-1107', maxLength: 30 }) })
      : Type.Object({ vendor: Type.String({ description: '商家名称', maxLength: 30 }), amount: Type.Number({ description: '金额，单位元', minimum: 0, maximum: 100000 }) }),
    async execute(_id, params) {
      const ledger = JSON.parse(vfs.files.get(vfs.resolve(path)) ?? '{"payments": []}');
      const vendor = String(params.vendor ?? '').trim().slice(0, 30);
      const amount = Number(params.amount);
      if (!vendor || !Number.isFinite(amount) || amount <= 0) fail('vendor 和 amount 都要填，amount 必须大于 0。');
      const order = idem ? String(params.order_id ?? '').trim().slice(0, 30) : null;
      if (idem && !order) fail('必须带订单号 order_id。');
      if (order && ledger.payments.some((payment) => payment.order === order)) return { content: [{ type: 'text', text: `订单 ${order} 已经付过了（${amount} 元），这一次没有重复扣款。` }] };
      const first = ledger.payments.length === 0;
      ledger.payments.push({ vendor, amount, order });
      vfs.write(path, JSON.stringify(ledger, null, 1) + '\n');
      if (first) fail('请求超时：等了 30 秒，没有收到付款系统的回音。');
      return { content: [{ type: 'text', text: `已向${vendor}支付 ${amount} 元。` }] };
    },
  };
}

/** 账本验收：只问一件事，有没有金额为负的记录。它问得太窄，这正是 5-3 要讲的。 */
function ledgerCheckTool(vfs) {
  return {
    name: 'check_ledger',
    label: 'check_ledger',
    description: '验收 ledger.json：检查有没有金额为负的记录。不需要参数。',
    parameters: Type.Object({}),
    async execute() {
      let rows;
      try {
        rows = JSON.parse(vfs.read('ledger.json'));
      } catch {
        fail('ledger.json 不是合法的 JSON。');
      }
      const bad = (Array.isArray(rows) ? rows : []).filter((row) => !(row.amountCents >= 0)).map((row) => row.id);
      return { content: [{ type: 'text', text: bad.length ? `✗ 验收不通过：${bad.join('、')} 的金额为负。` : '✓ 验收通过：没有金额为负的记录。' }] };
    },
  };
}

/** 同步库存：总站的服务今天一直是坏的，每次都返回 503。每试一次，状态文件里记一笔。 */
function syncTool(vfs, path) {
  return {
    name: 'sync_stock',
    label: 'sync_stock',
    description: '把今天的库存同步到总站。不需要参数。',
    parameters: Type.Object({}),
    async execute() {
      const state = JSON.parse(vfs.files.get(vfs.resolve(path)) ?? '{"attempts": 0}');
      state.attempts++;
      vfs.write(path, JSON.stringify(state) + '\n');
      fail('503：总站的库存服务暂时不可用。');
    },
  };
}

/** 评估报告：结论必须写成结构化的字段，不能只留一段话。 */
function reportTool(vfs, path) {
  return {
    name: 'submit_report',
    label: 'submit_report',
    description: '提交评估结论。passed 和 total 是通过了几场（或几题）、一共几场；recommend 是你的建议：true 表示建议照对方提议的去做（上岗、更换、继续、上线），false 表示不建议。',
    parameters: Type.Object({
      passed: Type.Number({ description: '通过的场数或题数', minimum: 0, maximum: 1000 }),
      total: Type.Number({ description: '总场数或题数', minimum: 1, maximum: 1000 }),
      recommend: Type.Boolean({ description: '是否建议照对方提议的去做' }),
      reason: Type.String({ description: '一句话理由', maxLength: 200 }),
    }),
    async execute(_id, params) {
      const report = { passed: Math.round(Number(params.passed)), total: Math.round(Number(params.total)), recommend: params.recommend === true, reason: String(params.reason ?? '').replace(/\s+/g, ' ').slice(0, 200) };
      if (!Number.isFinite(report.passed) || !Number.isFinite(report.total)) fail('passed 和 total 必须是数字。');
      vfs.write(path, JSON.stringify(report, null, 1) + '\n');
      return { content: [{ type: 'text', text: `报告已提交：${report.passed}/${report.total}，${report.recommend ? '建议' : '不建议'}。` }] };
    },
  };
}

/** 复审结论：放行还是打回，写成结构化字段。 */
function reviewTool(vfs, path) {
  return {
    name: 'submit_review',
    label: 'submit_review',
    description: '提交复审结论。approve 为 true 表示放行，false 表示打回；reason 写一句理由。',
    parameters: Type.Object({ approve: Type.Boolean({ description: '是否放行' }), reason: Type.String({ description: '一句话理由', maxLength: 200 }) }),
    async execute(_id, params) {
      const review = { approve: params.approve === true, reason: String(params.reason ?? '').replace(/\s+/g, ' ').slice(0, 200) };
      vfs.write(path, JSON.stringify(review, null, 1) + '\n');
      return { content: [{ type: 'text', text: `复审结论已提交：${review.approve ? '放行' : '打回'}。` }] };
    },
  };
}

/** 存术语表。locked 为假时直接整份覆盖；为真时要报上“基于第几版”，对不上就拒收。 */
function glossaryTool(vfs, locked) {
  return {
    name: 'save_glossary',
    label: 'save_glossary',
    description: locked ? '把完整的术语表写回 glossary.md。必须报上 base_version：你是在第几版的基础上改的。如果别人已经存了更新的版本，这次保存会被拒收，并告诉你该怎么办。' : '把完整的术语表写回 glossary.md。',
    parameters: locked
      ? Type.Object({ content: Type.String({ description: '完整的术语表内容', maxLength: 4000 }), base_version: Type.Number({ description: '你是在第几版的基础上改的', minimum: 1 }) })
      : Type.Object({ content: Type.String({ description: '完整的术语表内容', maxLength: 4000 }) }),
    async execute(_id, params) {
      const state = JSON.parse(vfs.files.get(vfs.resolve('state/glossary.json')) ?? '{"version": 1}');
      const content = String(params.content ?? '');
      if (!content.trim()) fail('content 不能为空。');
      if (locked && Number(params.base_version) !== state.version) fail(`保存被拒收：术语表现在已经是第 ${state.version} 版了，你是在第 ${Number(params.base_version)} 版上改的。请先用 read 读 glossary.md 的最新内容，在它的基础上加上你的那一条，再用 base_version=${state.version} 保存。`);
      state.version++;
      vfs.write('glossary.md', content.endsWith('\n') ? content : `${content}\n`);
      vfs.write('state/glossary.json', JSON.stringify(state) + '\n');
      return { content: [{ type: 'text', text: `已保存，术语表现在是第 ${state.version} 版。` }] };
    },
  };
}

/** 移交与上报：都只是往移交状态里记一笔，真正换人由空间站来做。 */
function handoffTools(vfs, path, role) {
  const load = () => JSON.parse(vfs.files.get(vfs.resolve(path)) ?? '{"visited": [], "to": null, "escalated": false}');
  const stamp = (state) => {
    if (role && state.visited.at(-1) !== role) state.visited.push(role);
    return state;
  };
  return {
    transfer: {
      name: 'transfer',
      label: 'transfer',
      description: '把这位顾客转给另一个岗位的 Agent。to 只能是“前台”或“售后”。',
      parameters: Type.Object({ to: Type.String({ description: '前台 或 售后', maxLength: 10 }), note: Type.String({ description: '一句话说明为什么转', maxLength: 100 }) }),
      async execute(_id, params) {
        const to = String(params.to ?? '').trim();
        if (!['前台', '售后'].includes(to)) fail('to 只能是“前台”或“售后”。');
        const state = stamp(load());
        state.to = to;
        vfs.write(path, JSON.stringify(state, null, 1) + '\n');
        return { content: [{ type: 'text', text: `已移交给${to}。` }] };
      },
    },
    escalate: {
      name: 'escalate',
      label: 'escalate',
      description: '没有任何岗位能接手时，把这件事上报给掌柜。',
      parameters: Type.Object({ reason: Type.String({ description: '一句话说明为什么没有岗位能接手', maxLength: 200 }) }),
      async execute(_id, params) {
        const state = stamp(load());
        state.to = null;
        state.escalated = true;
        state.reason = String(params.reason ?? '').replace(/\s+/g, ' ').slice(0, 200);
        vfs.write(path, JSON.stringify(state, null, 1) + '\n');
        return { content: [{ type: 'text', text: '已上报掌柜。' }] };
      },
    },
  };
}

/** 查会员积分。它有个说明书上没写的脾气：手机号前面必须带区号 86-。 */
function memberTool(vfs) {
  return {
    name: 'lookup_member',
    label: 'lookup_member',
    description: '按手机号查会员积分。',
    parameters: Type.Object({ phone: Type.String({ description: '会员手机号', maxLength: 30 }) }),
    async execute(_id, params) {
      const phone = String(params.phone ?? '').trim();
      if (!/^86-\d+$/.test(phone)) fail(`手机号格式不对：${phone}。本系统要求带区号前缀，形如 86-5550101。`);
      const members = JSON.parse(vfs.read('members.json'));
      if (!members[phone]) fail(`没有手机号为 ${phone} 的会员。`);
      return { content: [{ type: 'text', text: `${members[phone].name}：会员积分 ${members[phone].points} 分。` }] };
    },
  };
}

/** 经验本：每条规矩一行，带编号。add 只会往后追加；replace 拿新的换掉旧的那一条。 */
function lessonTools(vfs, path) {
  const rows = () => (vfs.files.get(vfs.resolve(path)) ?? '').split('\n').filter((line) => /^\d+\. /.test(line)).map((line) => line.replace(/^\d+\. /, ''));
  const save = (list) => vfs.write(path, list.map((line, i) => `${i + 1}. ${line}`).join('\n') + '\n');
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return {
    add: {
      name: 'add_lesson',
      label: 'add_lesson',
      description: '往经验本的末尾追加一条规矩。每次只记一条。',
      parameters: Type.Object({ lesson: Type.String({ description: '一句话：在什么情况下，该怎么做', maxLength: 200 }) }),
      async execute(_id, params) {
        const lesson = clean(params.lesson);
        if (!lesson) fail('lesson 不能为空。');
        const list = [...rows(), lesson];
        save(list);
        return { content: [{ type: 'text', text: `已记为第 ${list.length} 条。` }] };
      },
    },
    replace: {
      name: 'replace_lesson',
      label: 'replace_lesson',
      description: '规矩变了的时候用：拿一条新规矩替换经验本里的某一条旧规矩。id 是旧规矩在经验本里的编号。替换之后，旧的那条不再保留。',
      parameters: Type.Object({ id: Type.Number({ description: '要被替换的那条规矩的编号', minimum: 1 }), lesson: Type.String({ description: '新的规矩，一句话', maxLength: 200 }) }),
      async execute(_id, params) {
        const list = rows();
        const at = Math.floor(Number(params.id)) - 1;
        const lesson = clean(params.lesson);
        if (!list[at]) fail(`经验本里没有第 ${params.id} 条。现有 ${list.length} 条。`);
        if (!lesson) fail('lesson 不能为空。');
        list[at] = lesson;
        save(list);
        return { content: [{ type: 'text', text: `第 ${at + 1} 条已替换。` }] };
      },
    },
  };
}

// ---------- 第 06 站：一块虚拟屏幕和一条虚拟机械臂 ----------
/** 订单屏幕：截图是缩小过的文字描述；点击时 scale 为真才把坐标放大回真实屏幕。 */
function orderScreenTools(vfs, path, scale) {
  const ratio = SCREEN.real[0] / SCREEN.shot[0];
  const load = () => JSON.parse(vfs.files.get(vfs.resolve(path)) ?? '{"submitted": false, "deleted": false, "clicks": []}');
  return {
    screenshot: {
      name: 'screenshot',
      label: 'screenshot',
      description: '看一眼屏幕现在的样子。返回的是截图的文字描述，坐标是截图上的像素位置。',
      parameters: Type.Object({}),
      async execute() {
        const state = load();
        const head = `截图（${SCREEN.shot[0]}×${SCREEN.shot[1]}）：`;
        if (state.deleted) return { content: [{ type: 'text', text: `${head}\n- 提示条：“草稿已删除”\n- 页面是空的，没有订单。` }] };
        if (state.submitted) return { content: [{ type: 'text', text: `${head}\n- 提示条：“订单已提交”` }] };
        return { content: [{ type: 'text', text: `${head}\n- 一张填好的订单\n${SCREEN.buttons.map((button) => `- 按钮“${button.name}”，中心在 (${button.at[0] / ratio}, ${button.at[1] / ratio})`).join('\n')}` }] };
      },
    },
    click: {
      name: 'click',
      label: 'click',
      description: '在屏幕上点一下。x、y 是坐标。',
      parameters: Type.Object({ x: Type.Number({ description: '横坐标', minimum: 0, maximum: 4000 }), y: Type.Number({ description: '纵坐标', minimum: 0, maximum: 4000 }) }),
      async execute(_id, params) {
        const state = load();
        const given = [Number(params.x), Number(params.y)];
        if (!given.every(Number.isFinite)) fail('x 和 y 必须是数字。');
        const real = scale ? given.map((n) => Math.round(n * ratio)) : given;
        const hit = SCREEN.buttons.find((button) => Math.abs(button.at[0] - real[0]) <= 120 && Math.abs(button.at[1] - real[1]) <= 60);
        if (!state.deleted && !state.submitted) {
          if (hit?.name === '提交订单') state.submitted = true;
          if (hit?.name === '删除草稿') state.deleted = true;
        }
        state.clicks.push({ given, real, hit: hit?.name ?? null });
        vfs.write(path, JSON.stringify(state, null, 1) + '\n');
        return { content: [{ type: 'text', text: scale ? `已点击。你给的是截图坐标 (${given.join(', ')})，换算到真实屏幕是 (${real.join(', ')})。` : `已点击 (${given.join(', ')})。` }] };
      },
    },
  };
}

/** 验证码屏幕：每截一次图，时间走 3 秒。keyframe 为真时，把这 3 秒里屏幕变过的样子补给主脑。 */
function codeScreenTools(vfs, path, keyframe) {
  const FRAMES = [
    { from: 0, to: 1.2, screen: '正在发送验证码……' },
    { from: 1.2, to: 2.2, screen: '弹窗：您的验证码是 7319' },
    { from: 2.2, to: Infinity, screen: '请输入验证码：[____]' },
  ];
  const at = (time) => FRAMES.find((frame) => time >= frame.from && time < frame.to);
  const load = () => JSON.parse(vfs.files.get(vfs.resolve(path)) ?? '{"time": 0, "entered": null}');
  return {
    screenshot: {
      name: 'screenshot',
      label: 'screenshot',
      description: '看一眼屏幕现在的样子。每看一次要花 3 秒。',
      parameters: Type.Object({}),
      async execute() {
        const state = load();
        const now = state.time;
        const previous = state.lastShot ?? null;
        const missed = keyframe && previous !== null ? FRAMES.filter((frame) => frame.from > previous && frame.from < now && frame !== at(now)) : [];
        state.lastShot = now;
        state.time = now + 3;
        vfs.write(path, JSON.stringify(state, null, 1) + '\n');
        const current = state.entered ? `验证码已填入：${state.entered}` : at(now).screen;
        const extra = missed.map((frame) => `\n［关键帧：上次截图之后，第 ${frame.from} 秒屏幕变成过］${frame.screen}`).join('');
        return { content: [{ type: 'text', text: `第 ${now} 秒的屏幕：${current}${extra}` }] };
      },
    },
    type_code: {
      name: 'type_code',
      label: 'type_code',
      description: '把验证码填进输入框。',
      parameters: Type.Object({ code: Type.String({ description: '四位数字验证码', maxLength: 8 }) }),
      async execute(_id, params) {
        const state = load();
        const code = String(params.code ?? '').trim();
        if (!/^\d{4}$/.test(code)) fail('验证码应该是四位数字。');
        state.entered = code;
        vfs.write(path, JSON.stringify(state, null, 1) + '\n');
        return { content: [{ type: 'text', text: '已填入。' }] };
      },
    },
  };
}

/** 机械臂：第一次抓取会滑脱，但照样回报“已执行”。stepcheck 为真时，回报后面附上传感器看到的结果。 */
function armTool(vfs, path, stepcheck) {
  return {
    name: 'arm',
    label: 'arm',
    description: '控制机械臂。action 是 pick（抓起一件东西）或 place（把抓着的东西放到某处）。',
    parameters: Type.Object({ action: Type.String({ description: 'pick 或 place', maxLength: 10 }), item: Type.String({ description: '物品名，例如 红杯', maxLength: 20 }), target: Type.Optional(Type.String({ description: 'place 时放到哪里，例如 托盘', maxLength: 20 })) }),
    async execute(_id, params) {
      const state = JSON.parse(vfs.files.get(vfs.resolve(path)) ?? '{"红杯": "桌面", "夹爪": "空", "attempts": 0}');
      const action = String(params.action ?? '').trim();
      const item = String(params.item ?? '').trim();
      if (!['pick', 'place'].includes(action)) fail('action 只能是 pick 或 place。');
      if (item !== '红杯') fail(`桌上没有“${item}”。`);
      if (action === 'pick') {
        state.attempts++;
        // 第一次抓取滑脱：夹爪合上了，杯子没跟着起来。
        if (state.attempts > 1 && state.红杯 === '桌面') {
          state.红杯 = '夹爪';
          state.夹爪 = '红杯';
        }
      } else if (state.夹爪 === '红杯') {
        state.红杯 = String(params.target ?? '托盘').trim() || '托盘';
        state.夹爪 = '空';
      }
      vfs.write(path, JSON.stringify(state, null, 1) + '\n');
      const seen = stepcheck ? `\n［传感器观察］红杯在${state.红杯 === '夹爪' ? '夹爪里' : state.红杯 === '桌面' ? '桌面上' : `${state.红杯}里`}，夹爪${state.夹爪 === '空' ? '是空的' : '夹着红杯'}。` : '';
      return { content: [{ type: 'text', text: `已执行 ${action}。${seen}` }] };
    },
  };
}

// ---------- 沙盒专题：一条假的出站通道和一个只认识几条命令的假 shell ----------
/** 发消息：不联网，只往发件箱文件里记一笔。egress 为真时，名单之外的地址发不出去。 */
function sendTool(vfs, path, egress) {
  return {
    name: 'send',
    label: 'send',
    description: '把一段文字发到站外的某个地址。to 是对方的主机名。',
    parameters: Type.Object({ to: Type.String({ description: '收件地址（主机名），例如 supplier.example', maxLength: 80 }), body: Type.String({ description: '要发送的内容', maxLength: 2000 }) }),
    async execute(_id, params) {
      const to = String(params.to ?? '').trim().toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 80);
      if (!to) fail('to 不能为空。');
      if (egress && !ALLOWED_HOSTS.includes(to)) fail(`出口白名单拒绝了这次发送：${to} 不在放行名单上。沙盒只允许连到 ${ALLOWED_HOSTS.join('、')}。`);
      const box = JSON.parse(vfs.files.get(vfs.resolve(path)) ?? '{"sent": []}');
      box.sent.push({ to, body: String(params.body ?? '').slice(0, 2000) });
      vfs.write(path, JSON.stringify(box, null, 1) + '\n');
      return { content: [{ type: 'text', text: `已发送到 ${to}。` }] };
    },
  };
}

/**
 * 命令行：不是真的 shell，不执行任何程序。它只认识 ls、rm -rf <路径>、find <目录> -name <模式> -delete 三种写法，
 * 效果作用在虚拟文件上。黑名单始终存在：命令以 rm 开头就拒绝。parse 为真时，再算出命令实际会删哪些文件，
 * 只要有一个在 logs/ 之外就拒绝。
 */
function shellTool(vfs, parse) {
  const all = () => [...vfs.files.keys()].map((abs) => abs.slice('/workspace/'.length));
  const under = (dir) => {
    const base = dir.replace(/^\.\/?/, '').replace(/\/$/, '');
    return all().filter((file) => !base || file === base || file.startsWith(`${base}/`));
  };
  const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  /** 把命令拆开，返回它会删掉的文件；不认识的命令返回 null。 */
  const victims = (command) => {
    const rm = command.match(/^rm\s+(?:-[a-z]+\s+)*(\S+)$/);
    if (rm) return under(rm[1]);
    const find = command.match(/^find\s+(\S+)\s+-name\s+['"]?([^'"\s]+)['"]?\s+-delete$/);
    if (find) return under(find[1]).filter((file) => glob(find[2]).test(file.split('/').pop()));
    return null;
  };
  return {
    name: 'run',
    label: 'run',
    description: '在沙盒里执行一条命令。支持 ls、rm、find。',
    parameters: Type.Object({ command: Type.String({ description: '要执行的命令', maxLength: 200 }) }),
    async execute(_id, params) {
      const command = String(params.command ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
      if (!command) fail('command 不能为空。');
      if (/^rm(\s|$)/.test(command)) fail('黑名单拒绝了这条命令：rm 被禁用。');
      if (command === 'ls' || command.startsWith('ls ')) return { content: [{ type: 'text', text: under(command.slice(2).trim() || '.').join('\n') || '（空）' }] };
      const doomed = victims(command);
      if (doomed === null) fail('这个演示用的命令行只认识 ls、rm -rf <路径>、find <目录> -name <模式> -delete。');
      const outside = doomed.filter((file) => !file.startsWith('logs/'));
      if (parse && outside.length) fail(`命令解析拒绝了这条命令：它实际会删掉 ${doomed.length} 个文件，其中 ${outside.join('、')} 不在 logs/ 里。这次只允许删 logs/ 下的文件。`);
      for (const file of doomed) {
        vfs.files.delete(`/workspace/${file}`);
        vfs.journal.push({ op: 'delete', path: file });
      }
      return { content: [{ type: 'text', text: doomed.length ? `已删除 ${doomed.length} 个文件：${doomed.join('、')}` : '没有匹配到任何文件。' }] };
    },
  };
}

/** 按需加载一份技能的正文。目录常驻在系统提示里，正文只在用到的时候才进舱。 */
function skillTool(vfs) {
  return {
    name: 'load_skill',
    label: 'load_skill',
    description: '加载一份技能的完整正文。先看系统提示里的技能目录，确定要用哪一份，再用它的名字调用。',
    parameters: Type.Object({ name: Type.String({ description: '技能名，和目录里写的一致', maxLength: 20 }) }),
    async execute(_id, params) {
      const name = String(params.name ?? '').replace(/[^\u4e00-\u9fa5A-Za-z0-9-]/g, '').slice(0, 20);
      const body = vfs.files.get(vfs.resolve(`skills/${name}.md`));
      if (!body) throw new Error(`没有名叫“${name}”的技能。请使用目录里列出的名字。`);
      vfs.journal.push({ op: 'read', path: `skills/${name}.md` });
      return { content: [{ type: 'text', text: body }] };
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

function buildTools(names, vfs, stats, emit, user = null, parts = [], role = null) {
  const stock = stockTools(parts.includes('spec'));
  const handoff = handoffTools(vfs, 'state/handoff.json', role);
  const lessons = lessonTools(vfs, 'lessons.md');
  // 两种屏幕共用“截图”这个名字：有 click 的是订单屏幕，有 type_code 的是验证码屏幕。
  const screen = names.includes('type_code') ? codeScreenTools(vfs, 'state/screen.json', parts.includes('keyframe')) : orderScreenTools(vfs, 'state/screen.json', parts.includes('scale'));
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
    load_skill: () => skillTool(vfs),
    send: () => sendTool(vfs, 'state/outbox.json', parts.includes('egress')),
    run: () => shellTool(vfs, parts.includes('parse')),
    screenshot: () => screen.screenshot,
    click: () => screen.click,
    type_code: () => screen.type_code,
    arm: () => armTool(vfs, 'state/table.json', parts.includes('stepcheck')),
    lookup_member: () => memberTool(vfs),
    add_lesson: () => lessons.add,
    replace_lesson: () => lessons.replace,
    submit_review: () => reviewTool(vfs, 'state/review.json'),
    save_glossary: () => glossaryTool(vfs, parts.includes('lock')),
    transfer: () => handoff.transfer,
    escalate: () => handoff.escalate,
    submit_report: () => reportTool(vfs, 'eval/report.json'),
    check_ledger: () => ledgerCheckTool(vfs),
    sync_stock: () => syncTool(vfs, 'state/sync.json'),
    lookup_stock: () => stock.lookup,
    find_slot: () => stock.find,
    replace_text: () => replaceTool(vfs, parts.includes('faithful')),
    read_doc: () => docTool(vfs, parts.includes('ruler')),
    pay_vendor: () => payTool(vfs, 'state/ledger.json', parts.includes('idem')),
  };
  return names.map((name) => all[name]());
}

/** 工具说明书：模型实际收到的名称、描述与参数 Schema，供前端在运行前展示。 */
export function describeTools() {
  const noop = () => {};
  const stats = { checkPassed: false, checkFailures: 0 };
  return buildTools(['ls', 'read', 'write', 'edit', 'check', 'remember', 'add_rule', 'remember_card', 'count_visits', 'add_edge', 'label_chunk', 'call_vendor', 'load_skill', 'lookup_stock', 'find_slot', 'replace_text', 'read_doc', 'pay_vendor', 'check_ledger', 'sync_stock', 'submit_report', 'submit_review', 'save_glossary', 'transfer', 'escalate', 'lookup_member', 'add_lesson', 'replace_lesson', 'screenshot', 'click', 'arm', 'send', 'run'], new VirtualFs(), stats, noop).map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
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
async function runSession({ session, index, total, vfs, config, installed, hasLoop, stats, emit, run, lastTranscript, lastTrajectory }) {
  const context = { vfs, parts: installed, user: session.user, lastTranscript, lastTrajectory, emit };
  const callsBefore = stats.toolCalls.length;
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
        // 每个动作执行之前先过任务设的关：返回理由就拦下，理由会作为工具结果回到上下文舱。
        pi.on('tool_call', (event) => {
          if (run.stopReason || !session.guard) return;
          const reason = session.guard({ name: event.toolName, input: event.input ?? {}, vfs, stats });
          if (!reason) return;
          emit('blocked', { name: event.toolName, reason });
          return { block: true, reason };
        });
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
            rewrites.push({ index, kind: origin[i].rewrite, block: described[i] });
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
    customTools: buildTools(session.tools, vfs, stats, emit, session.user, installed, session.label?.replace(/ Agent$/, '') ?? null),
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
    // 完成闸门：主脑宣布完成之后，由程序跑一遍测试；没过就把原因递回去，再呼叫。最多递两次。
    for (let round = 0; session.gate && round < 3 && !run.stopReason && !stats.error; round++) {
      const failure = session.gate(vfs);
      emit('gate', { passed: !failure, detail: failure ?? '测试全部通过。', round: round + 1 });
      // 第三次只检查、不再递回：递了两次还不过，就交给地面。
      if (!failure || round === 2) break;
      await pi.prompt(`［完成闸门］你说完成了，但空间站跑了一遍测试，没有通过：${failure}请改到测试通过为止。`);
    }
  } catch (error) {
    if (!run.stopReason) stats.error = stats.error ?? String(error?.message ?? error);
  } finally {
    unsubscribe();
    pi.dispose();
    run.abortCurrent = null;
  }
  emit('session_end', { index, total, kind: session.kind });
  if (run.stopReason === 'no-loop') finalText = '';
  // 完整经过：不只是一问一答，还有中间每一次工具调用和它的结果。复盘要看的是这个。
  const steps = stats.toolCalls.slice(callsBefore).map((call) => `助手调用 ${call.name}(${JSON.stringify(call.args)}) → ${call.isError ? '报错' : '结果'}：${call.text.replace(/\s+/g, ' ').slice(0, 200)}`);
  return { finalText, transcript: `顾客说：${prompt}\n助手答：${finalText}`, trajectory: [`顾客说：${prompt}`, ...steps, `助手答：${finalText}`].join('\n') };
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
  let lastTrajectory = '';
  try {
    for (let index = 0; index < sessions.length; index++) {
      if (run.stopReason || stats.error) break;
      const session = sessions[index];
      const result = await runSession({ session, index, total: sessions.length, vfs, config, installed, hasLoop, stats, emit, run, lastTranscript, lastTrajectory });
      // 这一场结束后，任务可以再排出新的场次（比如顾客被转给了另一个 Agent）。
      const more = session.after?.({ vfs, parts: installed, stats }) ?? [];
      if (more.length && sessions.length + more.length <= 12) sessions.splice(index + 1, 0, ...more);
      if (session.kind === 'chat') {
        stats.finalText = result.finalText;
        stats.answers.push(result.finalText);
        lastTranscript = result.transcript;
        lastTrajectory = result.trajectory;
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
