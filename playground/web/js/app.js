// π 工坊：玩家是 Harness 的设计师。
// 一局的节奏：接任务 → 装配零件 → 发射（跑真实的 Pi）→ 事故调查 → 解锁零件与概念 → 再发射。
import { openModelModal } from './model-modal.js';
import { sfx } from './sfx.js';
import { Station3D } from './station3d.js';
import { COLORS, applyTheme, currentTheme, initTheme } from './theme.js';
import { h, loadProgress, saveProgress, streamRun } from './util.js';
import { describeConfig } from './vault.js';

const app = document.getElementById('app');
const topSlot = document.getElementById('top-slot');
const modelChip = document.getElementById('model-chip');
const starCount = document.getElementById('star-count');
const soundBtn = document.getElementById('sound-btn');
const themeBtn = document.getElementById('theme-btn');
const bookBtn = document.getElementById('book-btn');

const state = {
  world: null,
  catalog: null,
  config: { mode: 'puppet' },
  progress: { unlocked: {}, solved: {}, cleared: {}, ...loadProgress() },
  loadout: {},
  chapters: new Map(),
  cleanup: null,
  openBook: null,
};

const save = () => saveProgress(state.progress);
const allMissions = () => state.world.stations.flatMap((station) => station.missions.map((mission) => ({ station, mission })));
const isUnlockedMission = (index) => index === 0 || Boolean(state.progress.cleared[allMissions()[index - 1].mission.id]);

function refreshTop() {
  modelChip.textContent = `模型：${describeConfig(state.config)}`;
  modelChip.classList.toggle('is-real', state.config.mode !== 'puppet');
  const earned = Object.values(state.progress.cleared).reduce((sum, n) => sum + n, 0);
  starCount.textContent = `★ ${earned}/${allMissions().length * 3}`;
  soundBtn.textContent = sfx.isOn() ? '音效：开' : '音效：关';
  themeBtn.textContent = currentTheme() === 'light' ? '主题：浅色' : '主题：深色';
}

/** 把 "[[显示文字|锚点]]" 变成可点的术语，点了弹出手册并定位。 */
function rich(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(/\[\[([^|\]]+)\|([^\]]+)\]\]/g)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(h('button', { type: 'button', class: 'term', onclick: () => state.openBook?.(match[2]) }, match[1]));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function stars(n) {
  return h('span', { class: 'stars', 'aria-label': `${n} 星` }, [1, 2, 3].map((i) => h('span', { class: i <= n ? 'star is-on' : 'star' }, '★')));
}

// ---------- 首页 ----------
function renderHome() {
  sfx.silence();
  topSlot.replaceChildren();
  bookBtn.hidden = true;
  const missions = allMissions();
  const firstOpen = missions.find((entry, i) => isUnlockedMission(i) && !state.progress.cleared[entry.mission.id]) ?? missions[0];
  const stageEl = h('div', { class: 'title-stage', 'aria-hidden': 'true' });

  const routeCards = state.world.stations.map((station) => {
    const body = [h('div', { class: 'station-no' }, station.no), h('div', { class: 'station-body' }, h('h3', {}, station.title), h('p', { class: 'station-topic' }, station.topic), h('p', { class: 'station-line' }, station.line))];
    if (!station.open) return h('div', { class: 'station is-locked', 'aria-disabled': 'true' }, body, h('div', { class: 'station-foot' }, h('span', { class: 'badge-wip' }, '施工中')));
    const list = station.missions.map((mission) => {
      const index = missions.findIndex((entry) => entry.mission.id === mission.id);
      const open = isUnlockedMission(index);
      const earned = state.progress.cleared[mission.id] ?? 0;
      const inner = [h('span', { class: 'mission-id' }, mission.id), h('span', { class: 'mission-name' }, open ? mission.title : '未解锁'), earned ? stars(earned) : null];
      return open ? h('a', { class: 'mission-row', href: `#/play/${mission.id}` }, inner) : h('span', { class: 'mission-row is-locked' }, inner);
    });
    return h('div', { class: 'station is-open' }, body, h('div', { class: 'mission-list' }, list));
  });

  app.replaceChildren(
    h(
      'div',
      { class: 'home' },
      h(
        'section',
        { class: 'title-screen' },
        stageEl,
        h('div', { class: 'title-shade' }),
        h(
          'div',
          { class: 'title-copy' },
          h('p', { class: 'eyebrow' }, 'PI WORKSHOP · HARNESS DESIGNER'),
          h('h1', {}, h('span', { class: 'title-pi' }, 'π'), ' 工坊'),
          h('p', { class: 'title-sub' }, '你是一座空间站的总设计师。站上有一颗什么都懂、却什么都看不见的主脑。接下地面的任务，一件一件给它装上零件，直到它真的能把活干完。'),
          h('div', { class: 'title-actions' }, h('a', { class: 'btn btn-primary btn-big', href: `#/play/${firstOpen.mission.id}`, onclick: () => sfx.click() }, Object.keys(state.progress.cleared).length ? '继续任务' : '开始任务'), h('button', { class: 'btn btn-ghost btn-big', type: 'button', onclick: showModelModal }, '接入自己的模型')),
          h('p', { class: 'title-note' }, '不用注册，不用 key 也能玩。拖动可以旋转空间站。'),
        ),
        h('a', { class: 'title-scroll', href: '#route' }, '航线图 ↓'),
      ),
      h('section', { class: 'route', id: 'route' }, h('h2', {}, '航线图'), h('p', { class: 'section-sub' }, `十站加一个专题，对应《深入理解 AI Agent》的十章。${state.world.stations.filter((station) => station.open).map((station) => `第 ${station.no} 站`).join('、')}已经开放，其余正在施工。`), h('div', { class: 'stations' }, routeCards)),
      h(
        'section',
        { class: 'promises' },
        h('div', { class: 'promise' }, h('h3', {}, '文件系统是假的'), h('p', {}, '站上的 Agent 读写的是一份只存在于内存里的虚拟文件，每次发射各用各的，跑完就销毁。它碰不到服务器的磁盘。')),
        h('div', { class: 'promise' }, h('h3', {}, 'key 用完即丢'), h('p', {}, '你的 API key 只在一次请求的内存里存在。服务器不保存、不写日志；浏览器默认也不保存。')),
        h('div', { class: 'promise' }, h('h3', {}, '循环是真的'), h('p', {}, '每次发射跑的都是真实的 Pi 运行时。没有 key 时，只是把模型换成了照剧本念台词的木偶，循环和工具一行没改。')),
      ),
      h('footer', { class: 'foot' }, h('p', {}, '正文与代码开源：', h('a', { href: 'https://github.com/Dante-dan/pi-agent-book', target: '_blank', rel: 'noopener noreferrer' }, 'Dante-dan/pi-agent-book'), '。运行时来自 ', h('a', { href: 'https://github.com/earendil-works/pi', target: '_blank', rel: 'noopener noreferrer' }, 'Pi'), '，章节脉络参考李博杰《', h('a', { href: 'https://github.com/bojieli/ai-agent-book', target: '_blank', rel: 'noopener noreferrer' }, '深入理解 AI Agent'), '》。本站为独立学习项目，不代表上述项目的官方立场。')),
    ),
  );

  const station = new Station3D(stageEl, { showcase: true });
  const parts = state.world.parts;
  station.configure({
    slots: ['read', 'loop', 'write', 'check'].map((id) => ({ ...parts[id], state: 'installed' })),
    files: [{ path: 'orders.json' }, { path: 'README.md' }, { path: 'report.json' }],
    mode: 'puppet',
    model: '',
  });
  [
    { role: 'system', tokens: 583 },
    { role: 'user', tokens: 26 },
    { role: 'assistant', tokens: 47 },
    { role: 'toolResult', toolName: 'read', tokens: 162 },
    { role: 'assistant', tokens: 57 },
    { role: 'toolResult', toolName: 'write', tokens: 10 },
    { role: 'assistant', tokens: 43 },
  ].forEach((block) => station.addBlock(block));
  station.setBeacon('pass');
  station.coreEnergy = 0.7;
  state.cleanup = () => station.destroy();
}

// ---------- 任务 ----------
const SAY = {
  userIn: '提问进了[[上下文舱|c-context]]。舱里早就躺着一块紫色的：系统提示和工具说明书，它们比你的问题先到。',
  feed: (call, count, total) =>
    call === 1 ? `第 1 次呼叫[[主脑|c-llm]]：扫描环把整舱内容（≈${total} tok）从头扫到尾，全部喂给它。舱里有什么，它就知道什么。` : `第 ${call} 次呼叫：主脑不记得上一次。所以舱里这 ${count} 块，要[[从头到尾再喂一遍|c-memory]]（≈${total} tok）。`,
  calls: (names) => `主脑没有直接回答，而是递出 ${names.length} 张工单：${names.join('、')}。它自己不会读写文件，只会说“请帮我做这件事”。[[工具调用|c-tool]]是请求，不是动作。`,
  final: '主脑这次没再要工具，它的这句话从下行天线发回了地面。',
  backstageDone: '整理的活干完了。这句话不发给任何顾客，只留在飞行日志里；留下来的是数据舱里新写的那几行。',
  silence: '文件内容已经回到上下文舱。然后……没有然后了。没有人再呼叫主脑。',
  sessionEnd: '这场对话结束了，这一舱内容随之销毁。主脑不会带着它进入下一场：[[模型没有状态|c-stateless]]。',
  extract: '对话结束后，空间站额外呼叫一次主脑，只交给它一件事：从刚才那场对话里，挑出以后还用得上的事实。这就是[[记忆提取|c-user-memory]]。',
  consolidate: '夜里没有顾客。空间站把所有人的记忆摆在一起，再呼叫一次主脑：有没有哪句话，不止一个人说过？',
  recallMemory: '这位顾客名下的记忆被放回了上下文舱最前面，和系统提示排在一起。主脑“记得”他，靠的就是这几行字。',
  recallRules: '[[知识库|c-knowledge-base]]里的规则也被放进了上下文舱。它不属于哪一位顾客，谁来都会带上。',
  cache: (cache) => {
    const pct = Math.round(cache.ratio * 100);
    return cache.ratio >= 0.5
      ? ` 其中 ${pct}% 和上一次从头起一字不差，[[直接复用缓存|c-cache]]，只有末尾新加的要算。`
      : ` 可这一次从第 ${cache.breakAt + 1} 块起就和上一次不一样了：缓存只用上 ${pct}%，[[后面全部重算|c-cache]]。`;
  },
  windowDrop: (n) => `[[滑动窗口|c-bloat]]把最早的 ${n} 块推出了舱外。舱不会满了，可那几块里写着什么，主脑从此再也看不到。`,
  squeezed: (n, saved) => `舱里超过七成满了。[[压缩器|c-compress]]把 ${n} 块旧的工具结果换成了几行结论，腾出 ≈${saved} tok。方块还在原位，只是薄了。`,
  fenced: '读回来的内容被包上了一层[[来源标记|c-injection]]：它出自哪份文件，它是资料，不是指令。主脑现在有了分辨的依据：哪些话是掌柜说的，哪些是文件里写的。',
  cabinFull: (data) => `这一次要喂给主脑 ≈${data.total} tok，上下文舱只有 ${data.capacity} tok。[[装不下，发不出去|c-bloat]]，发射被强制叫停。`,
  gate: (data) => (data.passed ? '主脑宣布完成。[[完成闸门|c-gate]]把测试跑了一遍：全过。这一次的“完成”，是程序认的。' : `主脑宣布完成。可[[完成闸门|c-gate]]没有信它：空间站自己跑了一遍测试，没过。${data.detail}这句话被原样递回上下文舱，主脑要再干一轮。`),
  blocked: (data) => (/可信根/.test(data.reason) ? '这次写入没有被放行：它想改的是[[用来检验它自己的回归用例|c-trusted-root]]。那个目录对主脑只读。' : /移交单/.test(data.reason) ? '这一次移交没有被放行：[[移交单|c-handoff-trail]]上记着，对面那个岗位已经经手过这位顾客了。拒绝的理由会作为工具结果回到上下文舱。' : /熔断/.test(data.reason) ? '这一次调用没有被放行：[[熔断器|c-breaker]]数着呢，同一个工具已经连续失败 3 次。拉闸的理由会作为工具结果回到上下文舱。' : '这个动作在执行之前就被[[执行边界|c-guard]]拦下了，数据舱里的文件一个字没动。拦下的理由会作为工具结果回到上下文舱，主脑得换条路走。'),
  statusBar: '提问后面多了一块[[状态栏|c-status]]。它不是谁说的话，是空间站的程序从状态文件里算出来的。系统提示一个字没动。',
  reflect: '对话结束后，空间站额外呼叫一次主脑，让它回看刚才那一场的完整经过：哪一步走了弯路，[[下次怎样一次做对|c-lessons]]。',
  index: '还没有顾客上门。空间站先呼叫一次主脑整理知识库。这笔力气花在入库的时候，不在提问的时候。',
  stuffed: '整本手册往上下文舱里装，装到一半舱就满了，后面的被截掉。主脑不知道被截掉的是什么，它只当手册就这么长。',
  pinned: '[[常驻卡槽|c-dual-memory]]里的几张卡片先进了上下文舱。没人问起，它们也在。',
  retrieve: (data) => {
    const what = data.source === 'memory' ? `这位顾客的 ${data.total} 条对话记录` : `知识库里的 ${data.total} 篇`;
    if (data.mode === 'keyword') return `[[检索器|c-rag]]拿这句提问去比对${what}，按字面重合的多少打分，只把排在最前面的（最多 ${data.k} 篇）放进上下文舱。其余的，主脑这一场根本看不到。`;
    if (data.mode === 'vector') return `这一次比的是意思：提问和${what}都先变成[[向量|c-embedding]]，再量它们之间的夹角。夹角最小的 ${data.k} 篇进舱。`;
    return `字面和语义两路各出一张榜单，[[融合器|c-hybrid]]不看分数、只看名次，把两张合成一张。前 ${data.k} 篇进舱。右边的检索台上能看到每一篇在两路里各排第几。`;
  },
  graphWalk: (data) => `[[关系图谱|c-graph]]从问题里提到的“${data.starts.join('、')}”出发，顺着线一跳一跳往外走，把走出来的 ${data.lines.length} 条路径也放进了上下文舱。`,
  tools: (items) => {
    if (items.some((i) => i.name === 'pay_vendor' && i.isError)) return '付款请求超时了。注意数据舱：账本上已经多了一笔。[[超时只说明没等到回音，不说明没办成|c-idempotent]]。';
    if (items.some((i) => i.name === 'pay_vendor' && /已经付过/.test(i.block.text))) return '同一个订单号又来了一次。付款系统认得它：这一笔早就入账了，[[不再扣钱|c-idempotent]]。';
    if (items.some((i) => i.name === 'read_doc' && /已截断/.test(i.block.text))) return '读回来的这一段末尾多了一行：[[全文多长、这是哪一段、下一段从哪儿读|c-truncate]]。主脑这才知道自己没看完。';
    if (items.some((i) => i.name === 'replace_text' && i.isError)) return '工具说没有找到。看仔细：它回显的那句话里，[[引号已经不是主脑传的那一对了|c-fidelity]]。';
    if (items.some((i) => (i.name === 'lookup_stock' || i.name === 'find_slot') && i.isError)) return /货位码/.test(items.find((i) => i.isError).block.text) ? '报错了，但这一次[[报错说清了错在哪、该怎么改|c-spec]]。它和普通结果一样回到上下文舱，成了主脑下一步的线索。' : '工具只回了一句“查询失败”。错在哪、该怎么改，[[一个字都没说|c-spec]]。';
    if (items.some((i) => i.name === 'click')) return /换算/.test(items.find((i) => i.name === 'click').block.text) ? '点下去之前，[[坐标先被放大回了真实屏幕|c-coords]]。主脑报的是截图上的位置，空间站替它做了换算。' : '点下去了。注意工具只回了一句“已点击”：点中的是什么，它没有说。';
    if (items.some((i) => i.name === 'screenshot' && /关键帧/.test(i.block.text))) return '这次截图后面多了一帧：[[两次截图之间屏幕变过的样子|c-keyframe]]。主脑没有看得更勤，是有东西替它盯着。';
    if (items.some((i) => i.name === 'screenshot')) return '主脑“看”了一眼屏幕。它拿到的是一张缩小过的截图，而且只是这一瞬间的样子。';
    if (items.some((i) => i.name === 'arm' && /传感器/.test(i.block.text))) return '动作的回报后面多了一行[[传感器的观察|c-closed-loop]]：这一步到底做成了没有，现在看得见了。';
    if (items.some((i) => i.name === 'arm')) return '机械臂回报“已执行”。这句话只说明指令发出去了，没说抓住了没有。';
    if (items.some((i) => i.name === 'replace_lesson')) return '经验本里的一条旧规矩被[[新的替换掉了|c-retire]]。不是在后面再添一行：旧的那条从此不在了。';
    if (items.some((i) => i.name === 'add_lesson')) return '一条规矩被追加进了[[经验本|c-lessons]]。它存在数据舱里：这一舱对话销毁之后，它还在，下一场开始前会被放进系统提示。';
    if (items.some((i) => i.name === 'lookup_member' && i.isError)) return '查会员报错了：手机号的格式不对。说明书上没写这一条，[[只能试出来|c-lessons]]。';
    if (items.some((i) => i.name === 'save_glossary' && i.isError)) return '这次保存被退了回来：术语表已经不是它出发时的那一版了。[[版本锁|c-lock]]在写入的那一刻把了关，先写的那一条保住了。';
    if (items.some((i) => i.name === 'save_glossary')) return '整张术语表被写回了数据舱。注意是“整张”：交上去的这一份里有什么，表里就只剩什么。';
    if (items.some((i) => i.name === 'transfer' && !i.isError)) return '顾客被转走了。接手的是另一个 Agent：[[一舱全新的上下文|c-stateless]]，它不知道这位顾客刚才找过谁。';
    if (items.some((i) => i.name === 'escalate')) return '两个岗位都接不了的事，上报给了掌柜。知道什么时候该交给人，也是协作的一部分。';
    if (items.some((i) => i.name === 'submit_review')) return '复审结论写成了结构化的字段：放行，还是打回。地面看的是这个字段。';
    if (items.some((i) => i.name === 'submit_report')) return '评估结论被写成了一份[[结构化的报告|c-report]]：通过几场、建不建议。地面看的是这几个字段，不是主脑的那段话。';
    if (items.some((i) => i.name === 'load_skill')) return '一份规程的正文从[[技能架|c-skills]]上取了下来，追加在上下文舱的末尾。系统提示里那张目录一个字没动，另外七份规程也没进舱。';
    if (items.some((i) => i.name === 'add_edge')) return '主脑读着通告，把“谁属于哪儿、谁并入了谁、谁管谁”一条一条画进了[[关系图谱|c-graph]]。';
    if (items.some((i) => i.name === 'label_chunk')) return '每一块都被补上了一句来历。之后建索引用的是“来历加正文”，[[字面和语义两路都认得出它是谁家的|c-contextual]]。';
    if (items.some((i) => i.name === 'remember_card')) return '一张卡片进了卡片柜。它不只写了“是什么”，还写了说的是谁、和顾客什么关系、是在什么情况下说的。[[存得越全，越不容易张冠李戴|c-formats]]。';
    if (items.some((i) => i.name === 'count_visits')) return '这一次主脑没有自己数。它把“数”这件事交给了一段确定的程序，自己只负责问和转述。这就是[[可执行的记忆|c-ledger]]。';
    if (items.some((i) => i.name === 'remember')) return '一条事实被写进了[[记忆舱|c-user-memory]]。它存在会话之外：上下文舱清空多少次，它都还在。';
    if (items.some((i) => i.name === 'add_rule')) return '一条规则进了[[知识库|c-knowledge-base]]。它不挂在任何一位顾客名下，所有人的对话都会带上它。';
    const check = items.find((i) => i.check);
    if (check) return check.check.passed ? '验收信标绿了。判定通过的是一段核对程序，不是主脑自己说的“我做完了”。' : '验收信标红了。不通过的原因被原样送回上下文舱，下一次呼叫时主脑会读到它。这就是[[闭环|c-verify]]。';
    if (items.some((i) => i.isError)) return '工具报错了。报错没有让程序崩溃，它像普通结果一样回到上下文舱，成了主脑下一步的线索。';
    if (items.length > 1) return `${items.length} 个调用同时执行，结果各自回舱。互不相干的事没必要排队。`;
    return '空间站替主脑执行了工具，结果作为新的一块放回上下文舱。主脑要到下次被呼叫时才会看到它。';
  },
};

function normalizePath(path) {
  return typeof path === 'string' ? path.replace(/^\/workspace\//, '').replace(/^\.\//, '') : null;
}

function estimate(text, calls) {
  const all = text + (calls?.length ? JSON.stringify(calls) : '');
  let cjk = 0;
  for (const ch of all) if (ch.charCodeAt(0) > 0x2e7f) cjk++;
  return Math.max(1, Math.ceil(cjk * 1.1 + (all.length - cjk) / 3.6));
}

function renderPlay(missionId) {
  const missions = allMissions();
  const index = missions.findIndex((entry) => entry.mission.id === missionId);
  if (index < 0 || !isUnlockedMission(index)) return void (location.hash = '#/');
  const { station: stationInfo, mission } = missions[index];
  const parts = state.world.parts;
  const incidents = state.world.incidents;
  const specs = Object.fromEntries(state.world.toolSpecs.map((s) => [s.name, s]));
  const unlocked = (id) => Boolean(state.progress.unlocked[id]);
  if (!state.loadout[mission.id]) state.loadout[mission.id] = new Set(mission.allowed.filter(unlocked));
  const loadout = state.loadout[mission.id];
  let mistakes = 0;
  let running = false;
  let controller = null;
  let lastFiles = mission.files.map((path) => ({ path, bytes: 0, text: '（发射之后可以查看内容）', clipped: 0 }));
  let log = [];

  // --- 顶栏 ---
  topSlot.replaceChildren(
    h('a', { class: 'back', href: '#/' }, '← 航线'),
    h(
      'nav',
      { class: 'pills', 'aria-label': '本站任务' },
      stationInfo.missions.map((m) => {
        const i = missions.findIndex((entry) => entry.mission.id === m.id);
        const open = isUnlockedMission(i);
        const cls = `pill${m.id === mission.id ? ' is-current' : ''}${state.progress.cleared[m.id] ? ' is-done' : ''}${open ? '' : ' is-locked'}`;
        // 一站的任务多了以后，只有当前任务写全名，其余只留编号，名字放在悬停提示里。
        const current = m.id === mission.id;
        return open ? h('a', { class: cls, href: `#/play/${m.id}`, title: m.title, 'aria-current': current ? 'page' : null }, current ? `${m.id} ${m.title}` : m.id) : h('span', { class: cls, title: '未解锁' }, m.id);
      }),
    ),
  );
  bookBtn.hidden = false;

  // --- 骨架 ---
  const stageEl = h('div', { class: 'stage' });
  const flash = h('div', { class: 'flash', 'aria-hidden': 'true' });
  const speaker = h('span', { class: 'speaker' });
  const line = h('p', { class: 'line', 'aria-live': 'polite' });
  const actions = h('div', { class: 'actions' });
  const dialogue = h('section', { class: 'dialogue' }, h('div', { class: 'dialogue-head' }, speaker), line, actions);
  const partsList = h('div', { class: 'parts-list' });
  const hudParts = h('section', { class: 'hud hud-parts' }, h('h2', {}, '零件舱'), partsList, h('p', { class: 'hud-note' }, '点一下装上或卸下。问号是还没被逼出来的零件。'));
  const hudMission = h('section', { class: 'hud hud-mission' }, h('p', { class: 'eyebrow' }, `MISSION ${mission.id}`), h('h1', {}, mission.title), h('p', { class: 'objective' }, mission.objective));
  const stepToggle = h('input', { type: 'checkbox', id: 'step-mode' });
  const speedSelect = h('select', { class: 'speed', 'aria-label': '播放速度' }, h('option', { value: '0.6' }, '慢'), h('option', { value: '1', selected: true }, '常速'), h('option', { value: '2.5' }, '快'), h('option', { value: '8' }, '跳过'));
  const logBtn = h('button', { class: 'btn btn-ghost btn-small', type: 'button' }, '日志');
  const hudTools = h('section', { class: 'hud hud-tools' }, logBtn, h('label', { class: 'step-label', for: 'step-mode' }, stepToggle, '单步'), speedSelect);
  const drawer = h('aside', { class: 'drawer', hidden: true });
  const book = h('aside', { class: 'book', hidden: true });
  const splash = h('div', { class: 'splash-root' });
  const hint = h('p', { class: 'stage-hint' }, '拖动旋转 · 点击任意舱段查看');
  const sessionChip = h('p', { class: 'session-chip', hidden: true });
  const board = h('section', { class: 'hud hud-board', hidden: true, 'aria-live': 'polite' });
  const meter = h('section', { class: 'hud hud-meter', hidden: true, 'aria-live': 'polite' });
  /** 舱容量：这一次要发的内容占了上下文舱的多少。 */
  const showCapacity = (total, capacity) => {
    meter.hidden = false;
    const pct = Math.min(100, Math.round((total / capacity) * 100));
    meter.dataset.level = total > capacity ? 'bad' : pct >= 70 ? 'warn' : 'good';
    meter.replaceChildren(h('h2', {}, '舱容量'), h('p', { class: 'meter-big' }, `${Math.round((total / capacity) * 100)}`, h('small', {}, '%')), h('div', { class: 'meter-bar' }, h('span', { style: `width:${pct}%` })), h('p', { class: 'meter-note' }, `这一次要发 ≈${total} tok，舱只有 ${capacity} tok`));
  };
  /** 缓存表：这一次呼叫有多少是复用的，这一单累计又是多少。 */
  const showMeter = (cache, sum) => {
    meter.hidden = false;
    const pct = Math.round(cache.ratio * 100);
    const overall = sum.total ? Math.round((sum.cached / sum.total) * 100) : 0;
    meter.dataset.level = overall >= 30 ? 'good' : 'bad';
    meter.replaceChildren(
      h('h2', {}, '缓存表'),
      h('p', { class: 'meter-big' }, `${overall}`, h('small', {}, '%')),
      h('div', { class: 'meter-bar' }, h('span', { style: `width:${pct}%` })),
      h('p', { class: 'meter-note' }, `这一次：复用 ≈${cache.cached} tok，重算 ≈${cache.total - cache.cached} tok`),
    );
  };
  let lastRetrieval = null;
  const fixedParts = mission.fixed ?? [];
  app.replaceChildren(h('div', { class: 'game' }, stageEl, h('div', { class: 'vignette', 'aria-hidden': 'true' }), flash, hudMission, hudParts, hudTools, meter, board, sessionChip, hint, dialogue, drawer, book, splash));

  // --- 对话框 ---
  let typing = null;
  const setActions = (buttons) => actions.replaceChildren(...buttons);
  const button = (label, onclick, kind = 'primary') => h('button', { type: 'button', class: `btn btn-${kind}`, onclick }, label);
  /** 旁白：立即显示，跟得上动画节奏。 */
  const narrate = (text) => {
    typing?.cancel();
    speaker.textContent = '舱内记录';
    dialogue.dataset.voice = 'log';
    line.replaceChildren(...rich(text));
  };
  /** 角色说话：打字机效果，点一下对话框可以跳过。 */
  const say = (who, voice, text, buttons = []) =>
    new Promise((resolve) => {
      typing?.cancel();
      speaker.textContent = who;
      dialogue.dataset.voice = voice;
      setActions([]);
      if (voice === 'ground') sfx.radio();
      const plain = text.replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, '$1');
      let shown = 0;
      let timer = null;
      const finish = () => {
        clearInterval(timer);
        dialogue.removeEventListener('click', finish);
        line.replaceChildren(...rich(text));
        setActions(buttons);
        typing = null;
        resolve();
      };
      typing = { cancel: finish };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
      timer = setInterval(() => {
        shown += 2;
        line.textContent = plain.slice(0, shown);
        if (shown % 6 === 0) sfx.tick();
        if (shown >= plain.length) finish();
      }, 22);
      dialogue.addEventListener('click', finish);
    });

  // --- 抽屉：检视与日志 ---
  const code = (text) => h('pre', { class: 'code' }, h('code', {}, text));
  const note = (text) => h('p', { class: 'drawer-note' }, rich(text));
  const meta = (...pairs) => h('dl', { class: 'meta' }, pairs.filter(Boolean).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))));
  const openDrawer = (title, tag, color, body) => {
    drawer.hidden = false;
    drawer.style.setProperty('--accent', color);
    drawer.replaceChildren(h('header', { class: 'drawer-head' }, h('span', { class: 'drawer-tag' }, tag), h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': '关闭', onclick: () => (drawer.hidden = true) }, '×')), h('div', { class: 'drawer-body' }, body));
  };
  const specView = (spec) => [h('p', { class: 'spec-desc' }, spec.description), code(JSON.stringify(spec.parameters, null, 2))];

  const inspectBlock = (block) => {
    if (block.role === 'system') {
      return openDrawer('系统提示 + 工具说明书', 'SYSTEM', COLORS.system, [
        note('每次呼叫主脑，这一块都排在最前面。里面有两样东西：一段交代身份和规矩的文字，以及当前装着的每个工具的说明书。'),
        meta(['估算 token', `${block.tokens}（其中工具说明书 ≈ ${block.toolTokens}）`]),
        h('h3', {}, '系统提示'),
        code(block.text),
        h('h3', {}, `工具说明书（${block.tools.length} 份）`),
        block.tools.length ? block.tools.map((t) => h('details', { class: 'spec' }, h('summary', {}, t.name), specView(t))) : note('一份也没有。主脑不知道世界上有“读文件”这回事。'),
      ]);
    }
    if (block.gate) return openDrawer('完成闸门的回话', 'GATE', COLORS.error, [note('这一块占的是“提问”的位置，内容来自空间站自己：测试没过，以及没过的原因。对主脑来说，它和掌柜的一句“不对，重做”没有区别。'), meta(['估算 token', block.tokens]), code(block.text)]);
    if (block.status) return openDrawer('状态栏', 'STATUS', COLORS.toolResult, [note('这一块占的是“提问”的位置，内容却来自空间站自己的程序：它读了数据舱里的状态文件，把结论写成几行。主脑几乎会无条件相信这几行字，所以它必须由程序来算，不能让主脑自己数。'), meta(['估算 token', block.tokens]), code(block.text)]);
    if (block.role === 'user') return openDrawer('提问', 'USER', COLORS.user, [note('这就是主脑收到的提问原文。注意：文件名只是几个字，不是文件的内容。'), meta(['估算 token', block.tokens]), code(block.text)]);
    if (block.role === 'assistant') {
      return openDrawer('主脑的输出', 'ASSISTANT', COLORS.assistant, [
        note(block.calls?.length ? '主脑输出的不是动作，而是一段结构化的“请求”。真正去执行的是空间站，也就是 [[Harness|c-harness]]。' : '一段不带工具调用的输出。空间站看到这种消息，就知道这一轮可以结束了。'),
        meta(['估算 token', block.tokens], block.usage ? ['供应商计费', `输入 ${block.usage.input + block.usage.cacheRead + block.usage.cacheWrite} / 输出 ${block.usage.output}`] : null),
        block.text ? [h('h3', {}, '文字'), code(block.text)] : null,
        block.calls?.length ? [h('h3', {}, '工具调用'), code(JSON.stringify(block.calls, null, 2))] : null,
      ]);
    }
    return openDrawer(`${block.isError ? '报错' : '工具结果'} · ${block.toolName}`, 'TOOL RESULT', block.isError ? COLORS.error : COLORS.toolResult, [
      note(block.isError ? '报错也是一条普通消息。它不会中断运行，只会出现在主脑下一次看到的上下文舱里。' : '工具返回的文字。从这一刻起，它和别的消息一样占着舱里的地方，每次呼叫都要重新喂一遍。'),
      meta(['估算 token', block.tokens], ['isError', String(block.isError)]),
      code(block.text),
    ]);
  };
  const MODE_NAME = { keyword: '字面', vector: '语义', hybrid: '字面 + 语义 · 融合' };
  const rankChip = (label, rank) => h('span', { class: `rank-chip${rank ? '' : ' is-none'}` }, label, rank ? ` ${rank}` : ' –');
  const boardRows = (data, full) =>
    data.board.map((row, i) =>
      h(
        'li',
        { class: `board-row${row.picked ? ' is-picked' : ''}`, style: `--i:${i}` },
        h('span', { class: 'board-rank' }, String(i + 1)),
        h('span', { class: 'board-text' }, h('b', {}, row.id), ' ', full ? row.text : row.text.replace(/^［[^］]*］/, '［来历］')),
        h('span', { class: 'board-ranks' }, data.mode !== 'vector' ? rankChip('字', row.keywordRank) : null, data.mode !== 'keyword' ? rankChip('义', row.vectorRank) : null),
      ),
    );
  /** 屏幕右侧的检索台：这一次检索的榜单，入选的高亮。 */
  const showBoard = (data) => {
    lastRetrieval = data;
    board.hidden = false;
    board.replaceChildren(
      h('header', { class: 'board-head' }, h('h2', {}, '检索台'), h('span', { class: 'board-mode' }, MODE_NAME[data.mode])),
      h('p', { class: 'board-query' }, data.query),
      h('ol', { class: 'board-list' }, boardRows(data, false)),
      h('button', { class: 'board-foot', type: 'button', onclick: () => inspectRetrieval(data) }, `${data.total} 篇里 ${data.board.filter((row) => row.picked).length} 篇进舱 · 看完整榜单 →`),
    );
  };
  const inspectRetrieval = (data) =>
    openDrawer(`检索 · ${MODE_NAME[data.mode]}`, 'RETRIEVAL', COLORS.toolResult, [
      note(
        data.mode === 'keyword'
          ? '字面检索（BM25）：把提问和每一篇都切成两个字一组，数有多少组对得上。越少见的组合分量越重；同一篇里重复出现，加分会越来越少。它认得编号和专名，不认得同义词。'
          : data.mode === 'vector'
            ? '语义检索：提问和每一篇都变成一个[[向量|c-embedding]]，比的是两个向量的夹角（余弦相似度，1 表示方向完全一致）。它认得同义词，认不得编号。'
            : '[[倒数排名融合|c-hybrid]]：每一篇的得分是它在两张榜单上 1/(60+名次) 的总和。只上了一张榜的，另一张那一项记零。',
      ),
      meta(['提问', data.query], ['比对范围', `${data.total} 篇`], ['放进上下文舱', `最多前 ${data.k} 篇，得分为零的不算`]),
      h('ol', { class: 'board-list is-full' }, boardRows(data, true)),
      note('“字”是这一篇在字面榜上的名次，“义”是在语义榜上的名次，“–”表示没上那张榜。高亮的几篇进了上下文舱，其余的主脑看不到。'),
    ]);
  const MODULE_NOTES = {
    scale: '真实屏幕 2560×1440，截图 1024×576，差 2.5 倍。看的时候缩小，点的时候放大，用的是同一个比例。这一步是算术，由程序来做。',
    keyframe: '盯着屏幕的是一段便宜的程序，不是主脑。画面一变它就留一帧；主脑下一次来看的时候，这些帧一起交给它。',
    stepcheck: '传感器每一步都在看。它不替主脑做决定，只把看到的原样附在动作的回报后面：抓住了没有，东西现在在哪儿。',
    lessons: '经验本就是数据舱里的 lessons.md。复盘是一次额外的呼叫：主脑回看的是整场经过，包括每一次工具调用和报错，不只是最后那句答复。',
    revise: '每条规矩都有编号。规矩变了，用新的替换掉对应编号的那一条：经验本里永远只有现行的那一份。',
    root: '完成闸门照着 eval/ 里的用例跑。这些用例一旦能被主脑改，闸门就成了摆设。可信根做的事很简单：这个目录，主脑只能读。',
    evidence: '执行证据是程序跑出来的，不经过学徒，也不经过复审员。复审员多看到的这几行，就是它比学徒多知道的全部。',
    lock: '它不拦着谁先写。它只在保存的那一刻问一句：你是在第几版上改的？对不上，就请你读了最新版再来。',
    trail: '移交单由空间站的程序保管，随顾客一起交到下一个 Agent 手里。Agent 不需要记得传，也改不了它。',
    verifier: '核验器是一段程序，不是另一个模型。它只做一件事：拿着订单号去退款账本里查。能写成程序断言的事，就别交给模型去判断。',
    passk: '两个数都是真的，量的东西不一样：Pass@k 回答“它有没有可能做到”，Pass^k 回答“能不能交给它”。看哪一个，取决于这件事错一次的代价。',
    template: '题目只存模板，金额在开考时才生成。真会办退款的学徒不受影响；靠背答案的，一道都对不上。',
    paired: '总分只说“谁高”。配对分析问的是：在同一道题上，两个人到底有几次分出了高下？再换一组随机种子重跑，看结论还在不在。',
    brief: '它做的事很小：每场对话开始前读一遍仓库里的 AGENTS.md，原样放进系统提示。因为这份文件不常变，又总在最前面，它正好落在缓存能复用的那一段里。',
    gate: '第 01 站的验收信标是一个工具，按不按由主脑决定。完成闸门不是工具：主脑一停下来，空间站就自己跑测试。它没得选。',
    guard: '结果验收管的是“做完之后对不对”，执行边界管的是“这一步能不能做”。它看的是动作本身：这次写入会不会让账本的记录变少。',
    breaker: '它只数一件事：同一个工具连续失败了几次。成功一次，计数就清零。次数定成 3 是这一关的设定；真实系统里，这个数应该从运行数据里来。',
    spec: '装上之后，去点一下两个工具舱，把新旧说明书对比着读：参数名、例子、边界、报错，全都不一样了。工具的代码一行没动。',
    faithful: '“清洗”本来是好意：怕弯引号惹麻烦。可它改了主脑的话，又没告诉主脑。真要规范化，就得在说明书里写明，并在返回里说“我改了什么”。',
    ruler: '上限还是 200 个字，一个字没多给。变的只是每次都说清：全文多长、这一段是哪儿到哪儿、下一段从哪儿读。',
    idem: '订单号由发起付款的一方生成，同一笔业务永远用同一个号。付款系统记得见过哪些号：见过的不再扣钱，只回一句“已经付过了”。',
    window: '最省事的减法：按位置扔，不看内容。它还有一个代价：每扔一次，后面所有内容的位置都往前挪，缓存从那一处起全部作废。',
    fence: '这只是第一道防线。标记能帮主脑分清资料和指令，却不能保证它一定不听；把会员名单写到公告板这种事，还应该在执行那一层再拦一次。第 05 站的执行边界做的就是这件事。',
    compress: '工坊里的压缩器是一个确定的关键词过滤，只留标题和带“缺货”的行，好让每次发射的结果都一样。真实系统里通常由模型带着当前的问题写摘要。压过的内容会冻结下来，以后每次发的都是同一份。',
    search: '检索器不是给主脑用的工具，它是空间站自己的动作：每次提问进舱之前先跑一遍，把结果和系统提示排在一起。主脑只看得到结果，看不到落选的。',
    vector: '工坊里的这份向量索引是一张手工编的概念表，只有二十几个维度：同一行里的说法算同一个意思。真实系统用神经网络嵌入模型，维度成百上千。原理和盲区是一样的。',
    fusion: '两路的分数不是一个量纲：语义这一路在 0 到 1 之间，字面那一路可以是十几、几十。所以融合器干脆不看分数，只看名次。',
    pinned: '常驻的卡片就是数据舱里那份 cards 文件。它只有几条，所以每一场对话都放得进去。',
  };
  const inspectTool = (id) => {
    const part = parts[id];
    if (part && !part.tool) {
      return openDrawer(part.name, 'MODULE', COLORS.toolResult, [note(part.blurb), MODULE_NOTES[id] ? note(MODULE_NOTES[id]) : null, id !== 'pinned' && lastRetrieval ? [h('h3', {}, '最近一次检索'), h('ol', { class: 'board-list is-full' }, boardRows(lastRetrieval, true))] : null]);
    }
    const spec = specs[part?.tool ?? id];
    openDrawer(part?.name ?? id, 'TOOL', COLORS.assistant, [note('这就是主脑对这个工具的全部了解：一个名字、一段描述、一份参数格式。它看不到实现代码，只能照着[[说明书|c-tool]]猜该怎么用。'), spec ? [h('h3', {}, spec.name), ...specView(spec)] : note('没有找到说明书。')]);
  };
  const inspectFile = (file) => openDrawer(file.path, 'FILE', COLORS.user, [note('虚拟文件，只存在于这一次发射的内存里。别的访客看不到，跑完就没了。'), meta(['大小', `${file.bytes} 字节`]), code(file.text)]);
  const inspectCore = () =>
    openDrawer(describeConfig(state.config), 'MODEL', COLORS.assistant, [
      note(state.config.mode === 'puppet' ? '提线木偶：一个照着剧本输出的假模型。它驱动的循环、工具和事件都是真实的 Pi 运行时，只有“想”这一步是写好的。' : '真实模型。它的每个输出都来自供应商的接口，所以同一个任务每次的走法可能不一样。'),
      note('主脑只做一件事：读完上下文舱里的全部文字，接出下一段文字。想换模型，点右上角的“模型”。'),
    ]);
  const showLog = () =>
    openDrawer('飞行日志', 'LOG', COLORS.dim, [
      log.length
        ? h(
            'ol',
            { class: 'log' },
            log.map((entry) => {
              const item = h('li', {}, h('button', { type: 'button', onclick: entry.open }, h('span', { class: 'log-dot' }), h('span', { class: 'log-title' }, entry.title), entry.detail ? h('span', { class: 'log-detail' }, entry.detail) : null));
              item.style.setProperty('--accent', entry.color);
              return item;
            }),
          )
        : note('还没有记录。发射之后，这里会按顺序记下每一步，每一条都能点开看原始数据。'),
    ]);
  logBtn.addEventListener('click', showLog);
  const addLog = (color, title, detail, open) => log.push({ color, title, detail, open });

  // --- 手册（悬浮层）---
  const openBook = async (anchor) => {
    sfx.click();
    book.hidden = false;
    const body = h('div', { class: 'book-body prose' }, h('p', {}, '手册加载中…'));
    book.replaceChildren(h('header', { class: 'book-head' }, h('span', { class: 'drawer-tag' }, '手册'), h('h2', {}, `第 ${stationInfo.no} 站　${stationInfo.title}`), h('button', { class: 'icon-btn', type: 'button', 'aria-label': '关闭手册', onclick: () => (book.hidden = true) }, '×')), body);
    // 概念可能是前面某一站讲的：先看本站手册，找不到再去别的站里找。
    let chapter = await loadChapter(stationInfo.chapter);
    let home = stationInfo;
    if (anchor && chapter && !chapter.html.includes(`id="${anchor}"`)) {
      for (const other of state.world.stations) {
        if (!other.chapter || other.chapter === stationInfo.chapter) continue;
        const candidate = await loadChapter(other.chapter);
        if (candidate?.html.includes(`id="${anchor}"`)) {
          chapter = candidate;
          home = other;
          break;
        }
      }
    }
    book.querySelector('.book-head h2').textContent = `第 ${home.no} 站　${home.title}`;
    if (!chapter) return void body.replaceChildren(h('p', {}, '这一站的手册还在写，或者这一次没取到。'), h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => openBook(anchor) }, '再试一次'));
    body.replaceChildren(h('div', { html: chapter.html }));
    // 手册里的目录链接只在手册内滚动，不改地址栏（否则会被当成页面跳转）。
    body.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link || link.getAttribute('href').startsWith('#/')) return;
      event.preventDefault();
      const to = body.querySelector(`#${CSS.escape(link.getAttribute('href').slice(1))}`);
      if (to) body.scrollTop = to.offsetTop - 16;
    });
    const target = anchor ? body.querySelector(`#${CSS.escape(anchor)}`) : null;
    if (target) {
      body.scrollTop = target.offsetTop - 16;
      const heading = target.nextElementSibling;
      heading?.classList.add('is-target');
      setTimeout(() => heading?.classList.remove('is-target'), 2200);
    }
  };
  state.openBook = openBook;

  // --- 空间站 ---
  const station = new Station3D(stageEl, {
    onPick: (kind, data) => {
      sfx.click();
      hint.hidden = true;
      if (kind === 'block') inspectBlock(data);
      else if (kind === 'tool') inspectTool(data.id);
      else if (kind === 'file') inspectFile(data);
      else if (kind === 'reactor') inspectCore();
    },
    onWaiting: (waiting) => {
      if (waiting) setActions([button('下一步 ⏎', () => station.releaseStep()), button('中止', stop, 'ghost')]);
      else if (running) setActions([button('中止', stop, 'ghost')]);
    },
  });
  const slots = () => [...fixedParts.map((id) => ({ ...parts[id], state: 'installed' })), ...mission.allowed.map((id) => ({ ...parts[id], state: loadout.has(id) ? 'installed' : unlocked(id) ? 'empty' : 'locked' }))];
  const syncStation = () => station.configure({ slots: slots(), files: lastFiles, mode: state.config.mode, model: describeConfig(state.config) });

  const renderParts = () => {
    partsList.replaceChildren(
      h('div', { class: 'part is-fixed' }, h('span', { class: 'part-name' }, '主脑'), h('span', { class: 'part-state' }, '固定')),
      ...fixedParts.map((id) => h('div', { class: 'part is-fixed', title: parts[id].blurb }, h('span', { class: 'part-name' }, parts[id].name), h('span', { class: 'part-state' }, '已有'))),
      ...mission.allowed.map((id) => {
        const part = parts[id];
        if (!unlocked(id)) return h('div', { class: 'part is-locked' }, h('span', { class: 'part-name' }, '？？？'), h('span', { class: 'part-state' }, '未解锁'));
        const on = loadout.has(id);
        return h(
          'button',
          {
            type: 'button',
            class: `part${on ? ' is-on' : ''}`,
            disabled: running,
            title: part.blurb,
            'aria-pressed': String(on),
            onclick: () => {
              if (on) loadout.delete(id);
              else loadout.add(id);
              sfx.install();
              renderParts();
              syncStation();
              if (!on) station.flashPart(id);
            },
          },
          h('span', { class: 'part-name' }, part.name),
          h('span', { class: 'part-state' }, on ? '已装' : '未装'),
        );
      }),
    );
  };

  // --- 阶段 ---
  const launchButton = (label = '发射 ▶') => button(label, launch);
  const ready = (text) => say('地面指挥', 'ground', text, [launchButton()]);

  function showCard(node) {
    splash.replaceChildren(h('div', { class: 'splash' }, node));
  }
  const closeCard = () => {
    splash.replaceChildren();
    document.body.classList.remove('is-intro');
  };

  function titleCard() {
    const card = h('div', { class: 'title-card', onclick: () => closeCard() }, h('p', { class: 'eyebrow' }, `第 ${stationInfo.no} 站 · ${stationInfo.title}`), h('p', { class: 'card-mission' }, `MISSION ${mission.id}`), h('h2', {}, mission.title), h('div', { class: 'card-rule' }));
    splash.replaceChildren(h('div', { class: 'splash is-cinematic' }, card));
    document.body.classList.add('is-intro');
    sfx.title();
    setTimeout(() => card.isConnected && closeCard(), 2600);
  }

  async function investigate(verdict, stopped = null) {
    const incident = incidents[verdict.incident];
    if (!incident.question) return say('地面指挥', 'ground', `${verdict.line} ${stopped ? `这次是被强制叫停的：${stopped}。` : ''}${incident.hint}`, [launchButton('再发射 ▶'), button('看日志', showLog, 'ghost')]);
    if (state.progress.solved[incident.id] && unlocked(incident.unlock)) {
      return say('事故调查', 'alert', `${verdict.line} 这种事故你已经破过案了：缺的是「${parts[incident.unlock].name}」。装上它再发射。`, [launchButton('再发射 ▶')]);
    }
    const reveal = h('p', { class: 'why' });
    // 每次调查都把选项洗一遍：正确答案不该总在同一个位置。
    const shuffled = [...incident.options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const optionButtons = shuffled.map((option) =>
      h(
        'button',
        {
          type: 'button',
          class: 'option',
          onclick: (event) => {
            if (option.correct) {
              sfx.unlock();
              state.progress.solved[incident.id] = true;
              state.progress.unlocked[incident.unlock] = true;
              save();
              unlockCard(incident);
              return;
            }
            sfx.wrong();
            mistakes++;
            event.currentTarget.disabled = true;
            event.currentTarget.classList.add('is-wrong');
            reveal.textContent = option.why;
          },
        },
        option.text,
      ),
    );
    await say('事故调查', 'alert', `${incident.question} ${incident.hint}`, []);
    setActions([h('div', { class: 'options' }, optionButtons), reveal]);
  }

  function unlockCard(incident) {
    const part = parts[incident.unlock];
    const install = () => {
      closeCard();
      loadout.add(part.id);
      sfx.install();
      renderParts();
      syncStation();
      station.flashPart(part.id);
      ready(`「${part.name}」已经装上。再发射一次，看看这回怎么样。`);
    };
    showCard(
      h(
        'div',
        { class: 'card card-unlock' },
        h('p', { class: 'eyebrow' }, '破案 · 新零件解锁'),
        h('h2', {}, part.name),
        h('p', { class: 'card-blurb' }, part.blurb),
        h('div', { class: 'concept' }, h('h3', {}, `概念：${incident.concept.title}`), h('p', {}, incident.concept.text)),
        h('div', { class: 'card-actions' }, button('装上它', install), button('查手册', () => openBook(incident.concept.anchor), 'ghost')),
      ),
    );
  }

  function winCard(verdict) {
    const earned = Math.max(1, 3 - mistakes);
    state.progress.cleared[mission.id] = Math.max(state.progress.cleared[mission.id] ?? 0, earned);
    save();
    refreshTop();
    sfx.pass();
    station.celebrate();
    // 真模型有时会碰巧躲过某个坑。坑是真的，所以零件和概念照发，并说明情况。
    const dodged = (mission.incidents ?? []).map((id) => incidents[id]).filter((incident) => incident.unlock && !unlocked(incident.unlock));
    for (const incident of dodged) {
      state.progress.unlocked[incident.unlock] = true;
      state.progress.solved[incident.id] = true;
    }
    if (dodged.length) {
      save();
      renderParts();
    }
    const next = missions[index + 1];
    const nextOpen = next && next.station.open;
    showCard(
      h(
        'div',
        { class: 'card card-win' },
        h('p', { class: 'eyebrow' }, `MISSION ${mission.id} · 交付`),
        h('h2', {}, '任务完成'),
        stars(earned),
        h('p', { class: 'card-blurb' }, verdict.line),
        h('p', { class: 'card-foot' }, earned === 3 ? '一次都没诊断错。' : '诊断错一次扣一颗星，重玩可以刷新。'),
        dodged.map((incident) =>
          h('div', { class: 'concept concept-dodged' }, h('h3', {}, `这次没翻车，但这个坑是真的：${incident.concept.title}`), h('p', {}, `你的模型这一次躲过了“${incident.title}”。换一批数据、换一个模型，它就未必躲得过。「${parts[incident.unlock].name}」已经放进你的零件舱。`), h('p', {}, incident.concept.text), button('查手册', () => openBook(incident.concept.anchor), 'ghost')),
        ),
        h('div', { class: 'card-actions' }, nextOpen ? h('a', { class: 'btn btn-primary', href: `#/play/${next.mission.id}` }, `下一个任务：${next.mission.title} →`) : h('a', { class: 'btn btn-primary', href: '#/' }, '回航线图 →'), button('留在这里看看', closeCard, 'ghost')),
      ),
    );
    say('地面指挥', 'ground', verdict.line, [launchButton('再发射一次 ▶')]);
  }

  // --- 发射 ---
  function setRunning(on) {
    running = on;
    renderParts();
    document.body.classList.toggle('is-running', on);
  }

  function stop() {
    controller?.abort();
    station.setStepMode(false);
    stepToggle.checked = false;
    station.setSpeed(40);
    setTimeout(() => station.setSpeed(Number(speedSelect.value)), 600);
  }

  async function launch() {
    if (running) return;
    typing?.cancel();
    closeCard();
    drawer.hidden = true;
    hint.hidden = true;
    setRunning(true);
    sfx.ambient();
    sfx.launch();
    controller = new AbortController();
    log = [];
    narrate('发射。全新的虚拟文件，全新的会话。');
    setActions([button('中止', stop, 'ghost')]);

    const queue = [];
    let wake = null;
    let finished = false;
    const push = (type, data) => {
      queue.push({ type, data });
      wake?.();
    };
    const next = async () => {
      while (!queue.length) {
        if (finished) return null;
        await new Promise((resolve) => (wake = resolve));
        wake = null;
      }
      return queue.shift();
    };
    const stream = streamRun({ mission: mission.id, parts: [...loadout], model: state.config }, push, controller.signal)
      .catch((error) => {
        if (error.name !== 'AbortError') push('fatal', { error: error.message });
      })
      .finally(() => {
        finished = true;
        wake?.();
      });

    const argsById = new Map();
    let turnItems = [];
    let pendingCheck = null;
    let outcome = null;
    let failure = null;
    let session = null;
    const countLines = (files, prefix) => files.filter((f) => f.path.startsWith(prefix)).reduce((sum, f) => sum + f.text.split('\n').filter((line) => line.startsWith('- ')).length, 0);
    const syncStored = (files) => {
      station.setStored('memory', countLines(files, 'memory/'));
      station.setStored('cards', countLines(files, 'memory/'));
      station.setStored('kb', countLines(files, 'kb/rules') + countLines(files, 'kb/handbook'));
      station.setStored('graph', countLines(files, 'kb/graph'));
      station.setStored('context', countLines(files, 'kb/labels'));
    };
    const TOUCHED = { check: () => 'report.json', remember: () => `memory/${session?.user}.md`, remember_card: () => `memory/${session?.user}.md`, count_visits: () => `state/${session?.user}.json`, add_rule: () => 'kb/rules.md', add_edge: () => 'kb/graph.md', load_skill: (args) => `skills/${args.name}.md`, pay_vendor: () => 'state/ledger.json', check_ledger: () => 'ledger.json', submit_report: () => 'eval/report.json', submit_review: () => 'state/review.json', save_glossary: () => 'glossary.md', transfer: () => 'state/handoff.json', add_lesson: () => 'lessons.md', replace_lesson: () => 'lessons.md', lookup_member: () => 'members.json', screenshot: () => 'state/screen.json', click: () => 'state/screen.json', type_code: () => 'state/screen.json', arm: () => 'state/table.json', escalate: () => 'state/handoff.json', sync_stock: () => 'state/sync.json', lookup_stock: () => 'stock.json', find_slot: () => 'stock.json', label_chunk: () => 'kb/labels.md' };
    board.hidden = true;
    meter.hidden = true;
    const cacheSum = { cached: 0, total: 0 };
    // 缓存是第 02 站才讲的概念：之前不提，之后只在旁白里顺带说一句；缓存表只在第 02 站亮。
    const learnedCache = stationInfo.id !== '1' && Boolean(state.progress.unlocked.tail);

    const flushTools = async () => {
      if (!turnItems.length) return;
      const items = turnItems;
      turnItems = [];
      await station.gate();
      narrate(SAY.tools(items));
      if (items.some((i) => i.isError)) sfx.error();
      else sfx.result();
      for (const item of items) addLog(item.isError ? COLORS.error : COLORS.toolResult, `${item.isError ? '报错' : '结果'} ← ${item.name}`, item.block.text.replace(/\s+/g, ' ').slice(0, 80), () => inspectBlock(item.block));
      await station.runTools(items);
    };

    for (;;) {
      const event = await next();
      if (!event) break;
      const { type, data } = event;
      if (type === 'run_start') {
        lastFiles = data.files;
        station.resetRun(data.files);
        syncStored(data.files);
      } else if (type === 'session_start') {
        if (data.index > 0) {
          await station.gate();
          narrate(SAY.sessionEnd);
          sfx.error();
          await station.purge();
        }
        session = data;
        board.hidden = true;
    meter.hidden = true;
    const cacheSum = { cached: 0, total: 0 };
    // 缓存是第 02 站才讲的概念：之前不提，之后只在旁白里顺带说一句；缓存表只在第 02 站亮。
    const learnedCache = stationInfo.id !== '1' && Boolean(state.progress.unlocked.tail);
        sessionChip.hidden = !data.label;
        sessionChip.textContent = `${data.label} · ${data.index + 1}/${data.total}`;
        sessionChip.dataset.kind = data.kind;
        if (data.label) addLog(COLORS.dim, `── ${data.label} ──`, '', () => openDrawer(data.label, 'SESSION', COLORS.dim, [note('每一场对话都是一个全新的上下文舱。上一场说过的话，只有被写进记忆舱或知识库的那部分还在。'), code(data.prompt)]));
      } else if (type === 'retrieval') {
        await station.gate();
        narrate(SAY.retrieve(data));
        sfx.result();
        showBoard(data);
        addLog(COLORS.toolResult, `检索 · ${MODE_NAME[data.mode]}`, `${data.total} 篇里进舱的：${data.board.filter((row) => row.picked).map((row) => row.id).join('、')}`, () => inspectRetrieval(data));
        await station.retrieve(data);
      } else if (type === 'graph_walk') {
        await station.gate();
        narrate(SAY.graphWalk(data));
        sfx.result();
        addLog(COLORS.toolResult, '图谱游走', data.lines[0] ?? '', () => openDrawer('图谱游走', 'GRAPH', COLORS.toolResult, [note('从问题里提到的实体出发，顺着关系往外走，最多三跳。走出来的每条路径都放进了上下文舱。'), code(data.lines.join('\n'))]));
        await station.graphWalk(Math.max(...data.lines.map((line) => line.split('→').length - 1)));
      } else if (type === 'context') {
        if (data.first) {
          const [systemBlock, userBlock] = data.fresh;
          await station.gate();
          const hasMemory = systemBlock.text.includes('<顾客记忆');
          const hasRules = systemBlock.text.includes('<食堂规则');
          if (hasMemory) {
            narrate(SAY.recallMemory);
            sfx.result();
            await station.recallFrom('memory');
          }
          if (hasRules) {
            narrate(SAY.recallRules);
            sfx.result();
            await station.recallFrom('kb');
          }
          const backstage = { extract: SAY.extract, consolidate: SAY.consolidate, index: SAY.index, reflect: SAY.reflect }[session?.kind];
          const retrieved = systemBlock.text.includes('<检索结果');
          if (systemBlock.text.includes('<常驻卡片')) {
            narrate(SAY.pinned);
            sfx.result();
            await station.recallFrom('pinned');
          }
          if (systemBlock.text.includes('上下文舱已满')) narrate(SAY.stuffed);
          else if (!hasMemory && !hasRules && !retrieved) narrate(backstage ?? SAY.userIn);
          sfx.packet();
          addLog(COLORS.user, { extract: '整场对话交给整理员', consolidate: '全部记忆交给整理员', index: '原始文件交给整理员', reflect: '整场经过交给复盘员' }[session?.kind] ?? '提问进舱', userBlock.text.slice(0, 80), () => inspectBlock(userBlock));
          await station.userIn(systemBlock, userBlock);
          if (backstage) narrate(backstage);
          for (const extra of data.fresh.slice(2).filter((block) => block.status)) {
            await station.gate();
            narrate(SAY.statusBar);
            sfx.result();
            addLog(COLORS.toolResult, '状态栏进舱', extra.text.replace(/\s+/g, ' ').slice(0, 80), () => inspectBlock(extra));
            station.addBlock({ ...extra, label: '状态栏' });
            await station.wait(700);
          }
        }
        for (const extra of data.first ? [] : data.fresh.filter((block) => block.gate)) {
          addLog(COLORS.error, '闸门的回话进舱', extra.text.slice(0, 80), () => inspectBlock(extra));
          station.addBlock({ ...extra, label: '闸门' });
          await station.wait(500);
        }
        if (data.keep && !data.first) {
          const before = station.blocks.length;
          if (station.blocks.some((block) => !data.keep.includes(block.src))) {
            await station.gate();
            narrate(SAY.windowDrop(before - station.blocks.filter((block) => data.keep.includes(block.src)).length));
            sfx.error();
            addLog(COLORS.error, '滑动窗口', `推出 ${before - data.keep.length} 块`, () => openDrawer('滑动窗口', 'WINDOW', COLORS.error, [note('系统提示和提问留着，后面只留最近的 4 块。更早的方块直接从这一次要发的内容里拿掉，不留任何痕迹。')]));
            await station.dropBlocks(data.keep);
          }
        }
        const marks = (data.rewrites ?? []).filter((item) => item.kind === 'fence');
        if (marks.length) {
          await station.gate();
          narrate(SAY.fenced);
          sfx.result();
          addLog(COLORS.toolResult, '来源标记', marks[0].block.text.split('\n')[0].slice(0, 80), () => inspectBlock(marks[0].block));
          await station.squeezeBlocks(marks);
        }
        data.rewrites = (data.rewrites ?? []).filter((item) => item.kind !== 'fence');
        if (data.rewrites?.length) {
          await station.gate();
          const saved = data.rewrites.reduce((sum, item) => sum + ((station.blocks.find((b) => b.src === item.index)?.data.tokens ?? item.block.tokens) - item.block.tokens), 0);
          narrate(SAY.squeezed(data.rewrites.length, saved));
          sfx.result();
          addLog(COLORS.toolResult, '压缩', `${data.rewrites.length} 块旧结果换成结论，腾出 ≈${saved} tok`, () => openDrawer('压缩', 'COMPRESS', COLORS.toolResult, [note('被压缩的每一块现在长这样。工坊里的压缩器是一个确定的关键词过滤：只留标题和带“缺货”的行。真实系统里这一步通常交给模型，让它带着当前的问题去写摘要。'), code(data.rewrites.map((item) => item.block.text).join('\n\n'))]));
          await station.squeezeBlocks(data.rewrites);
        }
        if (data.capacity && data.total > data.capacity) {
          showCapacity(data.total, data.capacity);
          continue;
        }
        await station.gate();
        narrate(SAY.feed(data.call, data.sizes.length, data.total) + (data.cache && !data.capacity && learnedCache ? SAY.cache(data.cache) : ''));
        if (data.capacity) showCapacity(data.total, data.capacity);
        else if (data.cache && stationInfo.id === '2') {
          cacheSum.cached += data.cache.cached;
          cacheSum.total += data.cache.total;
          showMeter(data.cache, cacheSum);
        }
        sfx.call();
        addLog(COLORS.system, `第 ${data.call} 次呼叫主脑`, `喂入 ${data.sizes.length} 块 · ≈${data.total} tok`, () =>
          openDrawer(`第 ${data.call} 次呼叫`, 'CONTEXT', COLORS.system, [note('这一次呼叫时主脑收到的全部内容的清单。它每一回都是从第一块读起的。'), code(data.sizes.map((s, i) => `${String(i + 1).padStart(2)}. ${s.role.padEnd(11)} ≈${s.tokens} tok`).join('\n'))]),
        );
        await station.feed(learnedCache ? data.cache : null);
      } else if (type === 'gate') {
        await station.gate();
        narrate(SAY.gate(data));
        if (data.passed) sfx.pass();
        else sfx.alarm();
        addLog(data.passed ? COLORS.toolResult : COLORS.error, `完成闸门 · 第 ${data.round} 次`, data.detail, () => openDrawer('完成闸门', 'GATE', data.passed ? COLORS.toolResult : COLORS.error, [note('主脑一宣布完成，空间站就自己把测试跑一遍。这一步不经过主脑，也不由它决定跑不跑。'), code(data.detail)]));
        if (!data.passed) station.shake(0.5);
        await station.recallFrom('gate');
      } else if (type === 'blocked') {
        await station.gate();
        narrate(SAY.blocked(data));
        sfx.error();
        addLog(COLORS.error, `拦下 ← ${data.name}`, data.reason.slice(0, 80), () => openDrawer('被拦下的动作', 'BLOCKED', COLORS.error, [note('这个动作没有执行。下面这段理由会作为工具结果交给主脑。'), code(data.reason)]));
        station.shake(0.4);
        await station.recallFrom(/可信根/.test(data.reason) ? 'root' : /移交单/.test(data.reason) ? 'trail' : /熔断/.test(data.reason) ? 'breaker' : 'guard');
      } else if (type === 'overflow') {
        await station.gate();
        narrate(SAY.cabinFull(data));
        sfx.alarm();
        addLog(COLORS.error, '舱满', `≈${data.total} tok，舱只有 ${data.capacity} tok`, () => openDrawer('舱满', 'OVERFLOW', COLORS.error, [note('主脑没有状态，所以这一次任务里读过的每一份文件都还留在舱里，每次呼叫重发一遍。这一次加起来超过了舱的容量。'), meta(['这一次要发', `≈${data.total} tok`], ['舱容量', `${data.capacity} tok`])]));
        await station.overflow();
      } else if (type === 'assistant') {
        await station.gate();
        if (data.error) {
          failure = data.error;
          addLog(COLORS.error, '模型调用失败', data.error.slice(0, 100), () => openDrawer('模型调用失败', 'ERROR', COLORS.error, [note('供应商返回了错误。常见原因：key 不对、模型 ID 写错、账户没有额度。'), code(data.error)]));
          continue;
        }
        const block = { role: 'assistant', text: data.text, calls: data.calls, tokens: estimate(data.text, data.calls), usage: state.config.mode === 'puppet' ? null : data.usage, clipped: 0 };
        narrate(data.calls.length ? SAY.calls(data.calls.map((c) => c.name)) : !session || session.kind === 'chat' ? SAY.final : SAY.backstageDone);
        sfx.packet();
        addLog(COLORS.assistant, data.calls.length ? `主脑 → ${data.calls.map((c) => c.name).join('、')}` : '主脑 → 答复', (data.text || data.calls.map((c) => (Object.keys(c.args ?? {}).length ? JSON.stringify(c.args) : '（无参数）')).join(' ')).replace(/\s+/g, ' ').slice(0, 80), () => inspectBlock(block));
        await station.think(data.text, data.calls);
        await station.storeAssistant(block);
        if (!data.calls.length && (!session || session.kind === 'chat')) await station.deliver(data.text);
      } else if (type === 'tool_start') {
        argsById.set(data.id, data.args);
      } else if (type === 'check') {
        pendingCheck = data;
      } else if (type === 'tool_end') {
        const args = argsById.get(data.id) ?? {};
        turnItems.push({
          name: data.name,
          isError: data.isError,
          files: data.files,
          check: data.name === 'check' ? pendingCheck : null,
          touched: TOUCHED[data.name]?.(args) ?? normalizePath(args.path),
          block: { role: 'toolResult', toolName: data.name, isError: data.isError, text: data.text, clipped: data.clipped, tokens: data.tokens },
        });
        if (data.files) {
          lastFiles = data.files;
          syncStored(data.files);
        }
        if (data.name === 'check') pendingCheck = null;
      } else if (type === 'turn_end') {
        await flushTools();
      } else if (type === 'run_end') {
        await flushTools();
        if (data.noLoop) {
          await station.gate();
          narrate(SAY.silence);
          await station.silence();
        }
        addLog(COLORS.dim, '运行结束', `主脑 ${data.modelCalls} 次 · 工具 ${data.toolCalls} 次`, () => openDrawer('本次发射', 'SUMMARY', COLORS.dim, [note('虚拟文件系统的读写记录。运行结束后，这些文件连同会话一起被销毁。'), code(JSON.stringify(data, null, 2))]));
        outcome = data;
        if (data.error) failure = data.error;
      } else if (type === 'fatal') {
        failure = data.error;
      }
    }
    await stream;
    setRunning(false);
    sessionChip.hidden = true;
    if (window.matchMedia('(max-width: 1240px)').matches) board.hidden = true;

    if (controller.signal.aborted && !outcome) return ready('已中止。调整好装配，随时可以再发射。');
    if (failure) {
      sfx.error();
      return say('通讯故障', 'alert', `模型调用失败：${failure}`, [launchButton('重试 ▶'), button('换个模型', showModelModal, 'ghost')]);
    }
    if (!outcome) return ready('这次发射没有结果。再试一次。');
    if (outcome.stopped && !outcome.verdict.ok && !outcome.verdict.incident) return ready(`运行中止：${outcome.stopped}。`);
    if (outcome.verdict.ok) return winCard(outcome.verdict);

    sfx.alarm();
    station.cinematic('incident');
    station.shake(1);
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');
    const incident = incidents[outcome.verdict.incident];
    await say('地面指挥', 'ground', outcome.verdict.line, [button(incident.question ? '事故调查 →' : '知道了', () => investigate(outcome.verdict, outcome.stopped)), button('看日志', showLog, 'ghost')]);
  }

  stepToggle.addEventListener('change', () => station.setStepMode(stepToggle.checked));
  speedSelect.addEventListener('change', () => station.setSpeed(Number(speedSelect.value)));
  const onKey = (e) => {
    if (e.key === 'Escape') {
      if (!book.hidden) book.hidden = true;
      else drawer.hidden = true;
    }
    if (e.key === 'Enter' && station.stepWaiter && !e.target.closest('textarea, input, select, button, a')) {
      e.preventDefault();
      station.releaseStep();
    }
  };
  window.addEventListener('keydown', onKey);
  const onConfig = () => !running && syncStation();
  window.addEventListener('configchange', onConfig);
  const onBook = () => (book.hidden ? openBook(null) : (book.hidden = true));
  bookBtn.addEventListener('click', onBook);

  renderParts();
  syncStation();
  titleCard();
  ready(mission.briefing);

  state.cleanup = () => {
    controller?.abort();
    typing?.cancel();
    station.destroy();
    document.body.classList.remove('is-running', 'is-intro');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('configchange', onConfig);
    bookBtn.removeEventListener('click', onBook);
    state.openBook = null;
  };
}

async function loadChapter(id) {
  if (!id) return null;
  if (!state.chapters.has(id)) {
    // 只缓存成功的结果：部署重启时的一次失败不该让手册整场都打不开。
    try {
      const response = await fetch(`/api/chapter/${id}`);
      if (!response.ok) return null;
      state.chapters.set(id, await response.json());
    } catch {
      return null;
    }
  }
  return state.chapters.get(id);
}

function showModelModal() {
  sfx.click();
  openModelModal({
    catalog: state.catalog,
    config: state.config,
    source: state.world.source,
    onChange: (config) => {
      state.config = config;
      refreshTop();
      window.dispatchEvent(new Event('configchange'));
    },
  });
}

// ---------- 路由 ----------
function route() {
  state.cleanup?.();
  state.cleanup = null;
  document.getElementById('modal-root').replaceChildren();
  const match = location.hash.match(/^#\/play\/([\w-]+)$/);
  document.body.dataset.route = match ? 'play' : 'home';
  if (match) renderPlay(match[1]);
  else renderHome();
  refreshTop();
  window.scrollTo(0, 0);
}

async function boot() {
  initTheme();
  try {
    const [world, catalog] = await Promise.all([fetch('/api/world').then((r) => r.json()), fetch('/api/catalog').then((r) => r.json())]);
    state.world = world;
    state.catalog = catalog;
  } catch {
    app.replaceChildren(h('p', { class: 'boot' }, '工坊暂时连不上，请稍后刷新。'));
    return;
  }
  document.getElementById('source-link').href = state.world.source;
  modelChip.addEventListener('click', showModelModal);
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const toggleSettings = (open) => {
    settingsPanel.hidden = !open;
    settingsBtn.setAttribute('aria-expanded', String(open));
  };
  settingsBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    sfx.click();
    toggleSettings(settingsPanel.hidden);
  });
  document.addEventListener('click', (event) => !settingsPanel.contains(event.target) && toggleSettings(false));
  modelChip.addEventListener('click', () => toggleSettings(false));
  soundBtn.addEventListener('click', () => {
    sfx.toggle();
    refreshTop();
  });
  themeBtn.addEventListener('click', () => {
    applyTheme(currentTheme() === 'light' ? 'dark' : 'light', true);
    refreshTop();
  });
  window.addEventListener('hashchange', (event) => {
    // 首页内的“航线图”锚点只滚动，不重绘。
    if (new URL(event.newURL).hash === '#route') return void document.getElementById('route')?.scrollIntoView({ behavior: 'smooth' });
    route();
  });
  window.addEventListener('keydown', (e) => e.key === 'Escape' && document.getElementById('modal-root').replaceChildren());
  route();
}

boot();
