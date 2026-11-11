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
      h('section', { class: 'route', id: 'route' }, h('h2', {}, '航线图'), h('p', { class: 'section-sub' }, '十站加一个专题，对应《深入理解 AI Agent》的十章。第 01 站已经开放，其余正在施工。'), h('div', { class: 'stations' }, routeCards)),
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
  silence: '文件内容已经回到上下文舱。然后……没有然后了。没有人再呼叫主脑。',
  sessionEnd: '这场对话结束了，这一舱内容随之销毁。主脑不会带着它进入下一场：[[模型没有状态|c-stateless]]。',
  extract: '对话结束后，空间站额外呼叫一次主脑，只交给它一件事：从刚才那场对话里，挑出以后还用得上的事实。这就是[[记忆提取|c-user-memory]]。',
  consolidate: '夜里没有顾客。空间站把所有人的记忆摆在一起，再呼叫一次主脑：有没有哪句话，不止一个人说过？',
  recallMemory: '这位顾客名下的记忆被放回了上下文舱最前面，和系统提示排在一起。主脑“记得”他，靠的就是这几行字。',
  recallRules: '[[知识库|c-knowledge-base]]里的规则也被放进了上下文舱。它不属于哪一位顾客，谁来都会带上。',
  tools: (items) => {
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
        return open ? h('a', { class: cls, href: `#/play/${m.id}` }, m.id, ' ', m.title) : h('span', { class: cls }, m.id, ' 未解锁');
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
  const fixedParts = mission.fixed ?? [];
  app.replaceChildren(h('div', { class: 'game' }, stageEl, h('div', { class: 'vignette', 'aria-hidden': 'true' }), flash, hudMission, hudParts, hudTools, sessionChip, hint, dialogue, drawer, book, splash));

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
  const inspectTool = (id) => {
    const part = parts[id];
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
    const chapter = await loadChapter(stationInfo.chapter);
    if (!chapter) return void body.replaceChildren(h('p', {}, '这一站的手册还在写。'));
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
  const closeCard = () => splash.replaceChildren();

  function titleCard() {
    const card = h('div', { class: 'title-card', onclick: () => closeCard() }, h('p', { class: 'eyebrow' }, `第 ${stationInfo.no} 站 · ${stationInfo.title}`), h('p', { class: 'card-mission' }, `MISSION ${mission.id}`), h('h2', {}, mission.title), h('div', { class: 'card-rule' }));
    splash.replaceChildren(h('div', { class: 'splash is-cinematic' }, card));
    sfx.title();
    setTimeout(() => card.isConnected && closeCard(), 2600);
  }

  async function investigate(verdict) {
    const incident = incidents[verdict.incident];
    if (!incident.question) return say('地面指挥', 'ground', `${verdict.line} ${incident.hint}`, [launchButton('再发射 ▶'), button('看日志', showLog, 'ghost')]);
    if (state.progress.solved[incident.id] && unlocked(incident.unlock)) {
      return say('事故调查', 'alert', `${verdict.line} 这种事故你已经破过案了：缺的是「${parts[incident.unlock].name}」。装上它再发射。`, [launchButton('再发射 ▶')]);
    }
    const reveal = h('p', { class: 'why' });
    const optionButtons = incident.options.map((option) =>
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
      } else if (type === 'session_start') {
        if (data.index > 0) {
          await station.gate();
          narrate(SAY.sessionEnd);
          sfx.error();
          await station.purge();
        }
        session = data;
        sessionChip.hidden = !data.label;
        sessionChip.textContent = `${data.label} · ${data.index + 1}/${data.total}`;
        sessionChip.dataset.kind = data.kind;
        if (data.label) addLog(COLORS.dim, `── ${data.label} ──`, '', () => openDrawer(data.label, 'SESSION', COLORS.dim, [note('每一场对话都是一个全新的上下文舱。上一场说过的话，只有被写进记忆舱或知识库的那部分还在。'), code(data.prompt)]));
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
          if (!hasMemory && !hasRules) narrate(session?.kind === 'extract' ? SAY.extract : session?.kind === 'consolidate' ? SAY.consolidate : SAY.userIn);
          sfx.packet();
          addLog(COLORS.user, session?.kind === 'extract' ? '整场对话交给整理员' : session?.kind === 'consolidate' ? '全部记忆交给整理员' : '提问进舱', userBlock.text.slice(0, 80), () => inspectBlock(userBlock));
          await station.userIn(systemBlock, userBlock);
          if (session?.kind === 'extract' || session?.kind === 'consolidate') narrate(session.kind === 'extract' ? SAY.extract : SAY.consolidate);
        }
        await station.gate();
        narrate(SAY.feed(data.call, data.sizes.length, data.total));
        sfx.call();
        addLog(COLORS.system, `第 ${data.call} 次呼叫主脑`, `喂入 ${data.sizes.length} 块 · ≈${data.total} tok`, () =>
          openDrawer(`第 ${data.call} 次呼叫`, 'CONTEXT', COLORS.system, [note('这一次呼叫时主脑收到的全部内容的清单。它每一回都是从第一块读起的。'), code(data.sizes.map((s, i) => `${String(i + 1).padStart(2)}. ${s.role.padEnd(11)} ≈${s.tokens} tok`).join('\n'))]),
        );
        await station.feed();
      } else if (type === 'assistant') {
        await station.gate();
        if (data.error) {
          failure = data.error;
          addLog(COLORS.error, '模型调用失败', data.error.slice(0, 100), () => openDrawer('模型调用失败', 'ERROR', COLORS.error, [note('供应商返回了错误。常见原因：key 不对、模型 ID 写错、账户没有额度。'), code(data.error)]));
          continue;
        }
        const block = { role: 'assistant', text: data.text, calls: data.calls, tokens: estimate(data.text, data.calls), usage: state.config.mode === 'puppet' ? null : data.usage, clipped: 0 };
        narrate(data.calls.length ? SAY.calls(data.calls.map((c) => c.name)) : SAY.final);
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
          touched: data.name === 'check' ? 'report.json' : data.name === 'remember' ? `memory/${session?.user}.md` : data.name === 'add_rule' ? 'kb/rules.md' : normalizePath(args.path),
          block: { role: 'toolResult', toolName: data.name, isError: data.isError, text: data.text, clipped: data.clipped, tokens: data.tokens },
        });
        if (data.files) {
          lastFiles = data.files;
          station.setStored('memory', countLines(data.files, 'memory/'));
          station.setStored('kb', countLines(data.files, 'kb/'));
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
    await say('地面指挥', 'ground', outcome.verdict.line, [button(incident.question ? '事故调查 →' : '知道了', () => investigate(outcome.verdict)), button('看日志', showLog, 'ghost')]);
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
    document.body.classList.remove('is-running');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('configchange', onConfig);
    bookBtn.removeEventListener('click', onBook);
    state.openBook = null;
  };
}

async function loadChapter(id) {
  if (!id) return null;
  if (!state.chapters.has(id)) {
    try {
      const response = await fetch(`/api/chapter/${id}`);
      state.chapters.set(id, response.ok ? await response.json() : null);
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
