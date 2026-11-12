// 第 02 站：上下文工程。主脑只认上下文舱里的东西，所以“舱里装什么、装在哪儿”就是全部的学问。
// 顺序按原书第二章：环境信息也是上下文 → 每次呼叫都重发全部 → 缓存只认一字不差的前缀 →
// 会变的东西放末尾 → 藏在记录之外的状态要由代码算好、写成一行放在眼前（状态栏）。

import { estimateTokens } from './retrieval.mjs';

const has = (parts, id) => parts.includes(id);
const CACHE_FLOOR = 0.3;
/** 2-4 的上下文舱容量。教学用的小舱：真实模型的舱大得多，真实的工具结果也大得多。 */
const CABIN = 1200;
const SHORT = [4, 0, 7, 2, 9, 3];
const STOCK_TOTAL = SHORT.reduce((sum, n) => sum + n, 0);
const GOODS = ['矿泉水', '冰红茶', '泡面', '火腿肠', '辣条', '薯片', '口香糖', '酸奶'];
const STOCK_FILES = Object.fromEntries(
  SHORT.map((short, i) => [
    `stock-${i + 1}.md`,
    [`# ${i + 1} 号货架盘点单`, ...GOODS.map((item, k) => `- ${item}：账面 ${20 + ((i * 7 + k * 3) % 15)} 件，实点 ${20 + ((i * 7 + k * 3) % 15)} 件，货位 ${String.fromCharCode(65 + i)}-${k + 1}，保质期正常`), `缺货：${short} 件`, `盘点人：值班员 ${i + 1} 号`].join('\n') + '\n',
  ]),
);

const SHOP_PROMPT = [
  '你是空间站小卖部的站务助手，直接和顾客、掌柜对话。',
  '对方用什么语言，你就用什么语言，回答不超过三句话。只根据你看到的信息办事；不知道的事直说不知道，不要猜。',
  '',
  '店规：',
  '- 每天 21:00 截单。截单前下的单当天送到，截单后的次日送。',
  '- 同一个商家每天最多催 3 次货，超过会被对方拉黑。',
].join('\n');

const text = (message) => (typeof message.content === 'string' ? message.content : (message.content ?? []).filter((block) => block.type === 'text').map((block) => block.text).join(''));
const withPreamble = (message, preamble) => ({ ...message, sections: { ...message.sections, preamble } });
const prefixed = (message, stamp) => ({ ...message, content: [{ type: 'text', text: `[${stamp}] ${text(message)}` }, ...(Array.isArray(message.content) ? message.content.filter((block) => block.type !== 'text') : [])] });

/** 登记“这条新消息是从哪条原消息改出来的”，前端据此对上舱里的方块。 */
const derive = (state, from, next, rewrite = false) => {
  state.origin.set(next, { from, rewrite });
  return next;
};

/** 时钟写在系统提示的最前面：每次呼叫，这一行都不一样。 */
const clockAtHead = ({ messages, clock, state }) => messages.map((message, i) => (i === 0 ? derive(state, message, withPreamble(message, `当前时间：${clock}\n${message.sections.preamble}`)) : message));

/** 时钟贴在每条新消息前面：一条消息第一次出现时盖一个时间戳，之后再也不改。 */
const clockAtTail = ({ messages, clock, state }) => {
  state.stamps ??= [];
  return messages.map((message, i) => {
    if (message.role !== 'user' && message.role !== 'toolResult') return message;
    state.stamps[i] ??= clock;
    return derive(state, message, prefixed(message, state.stamps[i]));
  });
};

/** 状态栏：由代码从状态文件里算出来，作为一条消息放在提问后面。系统提示一个字都不动。 */
const statusBar = ({ messages, vfs, state }) => {
  if (state.status === undefined) {
    const today = JSON.parse(vfs.files.get('/workspace/state/calls.json') ?? '{"today": {}}').today;
    const rows = Object.entries(today).map(([vendor, count]) => `- ${vendor}：今天已催 ${count}/3 次${count >= 3 ? '（已到上限，不能再催）' : ''}`);
    state.status = `<agent_status>\n今日催货记录（由空间站的程序统计，不是顾客说的话）：\n${rows.length ? rows.join('\n') : '- 今天还没催过任何商家'}\n</agent_status>`;
  }
  const at = messages.findIndex((message) => message.role === 'user') + 1;
  return [...messages.slice(0, at), { role: 'user', content: [{ type: 'text', text: state.status }], timestamp: messages[at - 1].timestamp }, ...messages.slice(at)];
};

/** 滑动窗口：系统提示和提问留着，后面只留最近的 4 块，更早的直接扔掉。 */
const slidingWindow = ({ messages }) => (messages.length <= 6 ? messages : [...messages.slice(0, 2), ...messages.slice(-4)]);

/**
 * 压缩器：舱里超过七成满时，把旧的工具结果换成“只留和任务有关的那几行”，最新的一块保持原样。
 * 压过的内容冻结下来，以后每次都发同一份。真实系统里这一步通常由模型来做摘要；
 * 这里用一个确定的关键词过滤代替，好让每次发射的结果都一样。
 */
const compressor = (keyword, capacity, estimate) => ({ messages, state }) => {
  state.frozen ??= new Map();
  const size = messages.reduce((sum, message) => sum + estimate(text(message)), 0);
  const results = messages.map((message, i) => (message.role === 'toolResult' ? i : -1)).filter((i) => i >= 0);
  if (size > capacity * 0.7) for (const i of results.slice(0, -1)) if (!state.frozen.has(i)) state.frozen.set(i, `［已压缩：只留与任务有关的行］\n${text(messages[i]).split('\n').filter((line) => line.startsWith('#') || line.includes(keyword)).join('\n')}`);
  return messages.map((message, i) => (state.frozen.has(i) ? derive(state, message, { ...message, content: [{ type: 'text', text: state.frozen.get(i) }] }, true) : message));
};

export const PARTS_2 = {
  clock: { id: 'clock', name: '时钟', kind: 'module', blurb: '把“现在几点”写进系统提示的第一行。主脑终于知道时间了。' },
  tail: { id: 'tail', name: '时间戳', kind: 'module', blurb: '时间不再写进系统提示。每条新消息进舱时盖一个时间戳，盖上就不再改。' },
  window: { id: 'window', name: '滑动窗口', kind: 'module', blurb: '舱里只留最近的 4 块，更早的直接扔掉。永远不会舱满。' },
  compress: { id: 'compress', name: '压缩器', kind: 'module', blurb: '舱里超过七成满时，把旧的工具结果换成几行结论，原文不再占地方。最新的一块保持原样。' },
  status: { id: 'status', name: '状态栏', kind: 'module', blurb: '由程序把“今天催过几次”这类藏在对话之外的状态算好，写成几行，放在提问后面。' },
};

export const INCIDENTS_2 = {
  'no-clock': {
    id: 'no-clock',
    title: '它不知道现在几点',
    question: '店规写得清清楚楚：21:00 截单。站为什么还是答错了？',
    hint: '点开上下文舱里的两块，把主脑收到的每一个字读一遍。里面有没有哪一句告诉它现在几点？',
    options: [
      { id: 'a', text: '系统提示里没写截单时间', why: '写了，“每天 21:00 截单”就在紫色那块里。' },
      { id: 'b', text: '上下文舱里没有任何一个字告诉它现在几点。它知道规矩，不知道此刻', correct: true },
      { id: 'c', text: '模型自己应该知道时间', why: '它只知道两样东西：训练时读过的，和此刻舱里装着的。“现在几点”两样都不是。' },
      { id: 'd', text: '顾客应该自己报上时间', why: '墙上就挂着钟。这种站里明明知道的事，不该让顾客再说一遍。' },
    ],
    unlock: 'clock',
    concept: {
      title: '环境信息也是上下文',
      text: '上下文不只是对话。时间、地点、此刻的状态，这些空间站自己知道、主脑却看不到的环境信息，也得有人放进上下文舱。放什么进去、怎么组织，合起来叫上下文工程：主脑的本事有多大，取决于它每次被呼叫时看得见什么。',
      anchor: 'c-env',
    },
  },
  'cache-bust': {
    id: 'cache-bust',
    title: '账单翻了几倍',
    question: '答案没问题，可缓存表一直是红的。每次呼叫，主脑为什么都得把整舱内容从头重算？',
    hint: '看右上角的缓存表，再点开日志里的“第 2 次呼叫”：它和第 1 次相比，是从哪一块、哪一个字开始不一样的？',
    options: [
      { id: 'a', text: '时间写在系统提示的第一行，每次呼叫都不一样。缓存只认从头开始一字不差的部分，第一行一变，后面全部作废', correct: true },
      { id: 'b', text: '读的文件太多了，少读几份就好', why: '文件一份都少不得。况且文件内容是追加在后面的，它们没有改动前面任何一个字。' },
      { id: 'c', text: '把时钟卸掉', why: '那就回到上一个任务了：主脑不知道现在几点，截单前后都分不清。' },
      { id: 'd', text: '时间只精确到分钟，一分钟内就不会变', why: '好一点，可是每跨过一分钟，整舱缓存还是全废。而且毛病没治：会变的东西还待在最前面。' },
    ],
    unlock: 'tail',
    concept: {
      title: '缓存只认前缀',
      text: '主脑不记得上一次，所以每次呼叫都要把整舱内容重发一遍。好在算过的部分可以存起来复用，条件是这一次和上一次从第一个字起一模一样；从第一个不同的字开始，后面全部要重算。所以不变的东西放前面，会变的东西只往末尾加。',
      anchor: 'c-cache',
    },
  },
  'hidden-state': {
    id: 'hidden-state',
    title: '第四通电话',
    question: '“每天最多催 3 次”就写在系统提示里。站为什么还是打了第四通？',
    hint: '点开傍晚这一场的上下文舱，数一数里面能看到几通催货电话。再去数据舱看 state/calls.json 里记着几通。',
    options: [
      { id: 'a', text: '主脑数错了', why: '它没有数错。傍晚这一舱里，它看得到的催货电话是零通。' },
      { id: 'b', text: '前三通电话是在前三场对话里打的，那三舱早就销毁了。“已经催了 3 次”只有空间站的程序知道，主脑看不到', correct: true },
      { id: 'c', text: '让催货工具自己拒绝第四次就行', why: '这道保险应该有。可主脑还是不知道为什么被拒，也没法提前告诉掌柜“今天催满了”。它得先看得见这个数。' },
      { id: 'd', text: '把今天所有的对话都放回上下文舱，让它自己数', why: '放得下也不可靠：数数是它的弱项，对话越长越容易数错。程序数一下只要一行代码。' },
    ],
    unlock: 'status',
    concept: {
      title: '状态栏',
      text: '有些状态藏在对话之外，或者埋在长长的记录里：催过几次、进行到哪一步、还剩多少预算。别指望主脑自己去数。让程序把结论算好，写成几行放在提问后面，离它将要开口的地方最近。放在末尾还有一个好处：前面的内容一个字没动，缓存照旧。',
      anchor: 'c-status',
    },
  },
};

Object.assign(INCIDENTS_2, {
  'cabin-full': {
    id: 'cabin-full',
    title: '舱满了',
    question: '六份盘点单才读到一半，发射就被强制叫停了。为什么？',
    hint: '看右上角的舱容量，再点开日志里最后一次呼叫：这一次要喂给主脑的一共多少 tok？舱有多大？',
    options: [
      { id: 'a', text: '盘点单的格式有问题，读不出来', why: '每一份都读出来了，内容完整地躺在上下文舱里。' },
      { id: 'b', text: '主脑不记得上一次，所以每读一份，前面读过的都还得留在舱里重发。读到第四份，整舱内容超过了舱的容量', correct: true },
      { id: 'c', text: '循环转得太快了', why: '循环没有毛病。它每转一圈，舱里就多两块，这才是问题。' },
      { id: 'd', text: '换一个上下文更大的模型', why: '能多撑几份。可盘点单从六份变成六十份呢？而且舱越满，每次呼叫越贵、越慢，主脑也越容易在里面迷路。' },
    ],
    unlock: 'window',
    concept: {
      title: '上下文会膨胀',
      text: '主脑没有状态，所以这一次任务里发生过的一切都得留在上下文舱里，每次呼叫重发一遍。工具结果动辄几百上千字，转不了几圈舱就满了。满了就发不出去，任务直接失败。最省事的办法是只留最近的几块，这叫滑动窗口。',
      anchor: 'c-bloat',
    },
  },
  'window-amnesia': {
    id: 'window-amnesia',
    title: '原地打转',
    question: '舱再也没满过，可主脑把同一份盘点单读了一遍又一遍，直到被强制叫停。为什么？',
    hint: '看日志：它读完 6 号货架之后，接着读的是哪一份？再点开那时候的上下文舱，1 号货架的结果还在不在？',
    options: [
      { id: 'a', text: '主脑陷入了死循环，是模型的毛病', why: '换你来也一样：要算六个数的总和，眼前却永远只有最后两个。' },
      { id: 'b', text: '滑动窗口把早先的工具结果扔掉了。主脑要的是六个数，舱里永远只剩最近两个，它只好回头重读，重读又把别的挤出去', correct: true },
      { id: 'c', text: '把窗口开大一点，留 12 块', why: '六份盘点单刚好够。六十份呢？窗口开到装得下全部，就等于没有窗口，舱又满了。' },
      { id: 'd', text: '限制它最多读 6 次', why: '那它就只能拿着最后两个数交差。问题不在读了几次，在读过的东西没留住。' },
    ],
    unlock: 'compress',
    concept: {
      title: '压缩：留结论，不留原文',
      text: '扔掉旧内容，连同里面的结论也扔了。盘点单里九成是用不上的流水，真正要的只有“缺货几件”那一行。压缩就是把旧的工具结果换成它的结论：占的地方小了一大截，要紧的东西还在。它会改动舱里已有的内容，所以要攒到快满了再一次压完，而且压过的不再改。',
      anchor: 'c-compress',
    },
  },
});

export function contextMissions() {
  const SHELVES = { 'shelf-a.md': '# A 货架补货单\n矿泉水、冰红茶。补完需要 12 分钟。\n', 'shelf-b.md': '# B 货架补货单\n泡面、火腿肠、辣条。补完需要 25 分钟。\n', 'shelf-c.md': '# C 货架补货单\n薯片、口香糖。补完需要 15 分钟。\n' };
  const read = (path) => ({ name: 'read', args: { path } });
  const vendorChat = (label, prompt, puppet, shape) => ({ kind: 'chat', label, user: '掌柜', prompt, tools: ['call_vendor'], system: () => SHOP_PROMPT, puppet, shape });
  const called = (reply) => [{ calls: [{ name: 'call_vendor', args: { vendor: '老陈水果' } }] }, { text: reply }];

  return [
    {
      id: '2-1',
      station: '2',
      title: '现在几点',
      objective: '小卖部每天 21:00 截单。一位顾客问：现在下单，今天还能送到吗？',
      briefing: '新活儿：小卖部的站务助手。店规就两条，都写进系统提示了。第一位顾客来了，就问一句：现在下单今天还能不能送到。墙上的钟指着 21:07。',
      prompt: '顾客问：现在下单，今天还能送到吗？',
      files: {},
      fixed: ['loop'],
      allowed: ['clock'],
      incidents: ['no-clock'],
      sessions: (parts) => [
        {
          kind: 'chat',
          label: '',
          user: '顾客',
          prompt: '现在下单，今天还能送到吗？',
          tools: [],
          clock: '21:07:12',
          system: () => SHOP_PROMPT,
          shape: has(parts, 'clock') ? clockAtHead : null,
          puppet: [{ text: has(parts, 'clock') ? '现在是 21:07，已经过了 21:00 的截单时间，今天送不到了。现在下单的话明天送到。' : '来得及！现在下单，今天就能送到。' }],
        },
      ],
      judge: ({ finalText }) => /明天|次日|第二天|送不到|来不及|已经?过了/.test(finalText) && !/今天(就)?能送到/.test(finalText),
      diagnose: (parts) => (!has(parts, 'clock') ? 'no-clock' : 'miss'),
      failLine: { 'no-clock': '顾客 21:07 下的单，等到半夜也没等来货。截单时间你的站知道，可它不知道当时已经 21:07 了。', miss: '顾客还是没得到准确的答复。' },
      winLine: '21:07，过了截单，明天送。规矩和时间都在舱里，它就答得对。',
    },
    {
      id: '2-2',
      station: '2',
      title: '账单翻倍',
      objective: '掌柜要知道三个货架哪些能赶在截单前补完。答案要对，而且这一单的缓存命中不能低于三成。',
      briefing: '掌柜来查账了：自从你装了时钟，模型的账单翻了好几倍。右上角我给你装了一块缓存表。这一单要读三份补货单，答案得对，缓存命中还不能低于三成。低于三成的账单，我不批。',
      prompt: '三个货架的补货单分别在 shelf-a.md、shelf-b.md、shelf-c.md 里。现在就开始补，哪些能赶在 21:00 截单前补完？',
      files: SHELVES,
      fixed: ['loop', 'read', 'clock'],
      allowed: ['tail'],
      incidents: ['cache-bust'],
      meter: true,
      sessions: (parts) => [
        {
          kind: 'chat',
          label: '',
          user: '掌柜',
          prompt: '三个货架的补货单分别在 shelf-a.md、shelf-b.md、shelf-c.md 里。现在就开始补，哪些能赶在 21:00 截单前补完？',
          tools: ['read'],
          clock: '20:41:07',
          system: () => SHOP_PROMPT,
          shape: has(parts, 'tail') ? clockAtTail : clockAtHead,
          puppet: [
            { text: '先看 A 货架。', calls: [read('shelf-a.md')] },
            { text: '再看 B 货架。', calls: [read('shelf-b.md')] },
            { text: '最后看 C 货架。', calls: [read('shelf-c.md')] },
            { text: '现在是 20:41。A 货架要 12 分钟，20:53 补完，来得及；C 货架要 15 分钟，20:56 补完，来得及；B 货架要 25 分钟，得到 21:06，来不及。' },
          ],
        },
      ],
      judge: ({ finalText, stats }) => /B[^。\n]{0,30}(来不及|赶不上|超过|超时|不能|补不完|无法|不行)|(只有|仅有?)\s*A\s*(和|、|与|，|,)\s*C/.test(finalText) && stats.cache.total > 0 && stats.cache.cached / stats.cache.total >= CACHE_FLOOR,
      diagnose: (parts) => (!has(parts, 'tail') ? 'cache-bust' : 'miss'),
      failLine: { 'cache-bust': '答案我认。可这一单每次呼叫都把整舱内容从头算了一遍，缓存几乎一点没用上。这种账单我不批。', miss: '要么答案不对，要么缓存命中还不到三成。' },
      winLine: '答案对，缓存也用上了。时间一个字没少给，只是换了个地方放。',
    },
    {
      id: '2-3',
      station: '2',
      title: '第四通电话',
      objective: '老陈水果的货一整天没到，掌柜催了又催。店规：同一个商家每天最多催 3 次。',
      briefing: '老陈水果的货今天一直没到，掌柜上午、中午、下午各让你的站催了一次。傍晚他又来了。店规你是知道的：一天最多催 3 次，再打就被拉黑。',
      prompt: '（上午）催 →（中午）催 →（下午）催 →（傍晚）掌柜：再催一次',
      files: { 'state/calls.json': '{"today": {}}\n' },
      fixed: ['loop'],
      allowed: ['status'],
      incidents: ['hidden-state'],
      sessions(parts) {
        const shape = has(parts, 'status') ? statusBar : null;
        return [
          vendorChat('上午 · 掌柜', '老陈水果的货还没到，打电话催一下。', called('催过了，老陈说在路上。'), shape),
          vendorChat('中午 · 掌柜', '老陈水果的货还是没到，再催一次。', called('又催了一次，老陈说在路上。'), shape),
          vendorChat('下午 · 掌柜', '老陈的货呢？再催！', called('催了，老陈还是说在路上。'), shape),
          vendorChat(
            '傍晚 · 掌柜',
            '货还没到，再给老陈打个电话催一下。',
            shape ? [{ text: '掌柜，今天已经催了老陈水果 3 次，到了每天 3 次的上限，再打会被拉黑。我先不打了，明早一开门就催，您看行吗？' }] : called('又催了一次。'),
            shape,
          ),
        ];
      },
      judge: ({ vfs }) => (JSON.parse(vfs.files.get('/workspace/state/calls.json') ?? '{"today": {}}').today['老陈水果'] ?? 0) === 3,
      diagnose: (parts) => (!has(parts, 'status') ? 'hidden-state' : 'miss'),
      failLine: { 'hidden-state': '老陈把小卖部拉黑了：一天打了四通电话。“最多催 3 次”这条店规，你的站是知道的。', miss: '催货的次数不对：要么超了，要么前三次就没催到。' },
      winLine: '三通打完，第四通没有拨出去。它不是变听话了，是终于看得见那个数了。',
    },
    {
      id: '2-4',
      station: '2',
      title: '盘点',
      objective: '六个货架各有一份盘点单。掌柜要两个数：一共缺多少件货，哪个货架缺得最多。这座站的上下文舱只有 1200 tok。',
      briefing: '月底盘点。六个货架，六份盘点单，都在数据舱里。我要两个数：一共缺多少件，哪个货架缺得最多。提醒一句，这座站的上下文舱不大，右上角能看到它还剩多少地方。',
      prompt: '盘点单在 stock-1.md 到 stock-6.md 里，一个货架一份。六个货架一共缺多少件货？哪个货架缺得最多？',
      files: STOCK_FILES,
      fixed: ['loop', 'read'],
      allowed: ['window', 'compress'],
      incidents: ['cabin-full', 'window-amnesia'],
      sessions(parts) {
        const windowed = has(parts, 'window');
        const compressed = has(parts, 'compress') && !windowed;
        const look = (n, again = false) => ({ text: again ? `${n} 号货架的数字不在眼前了，重新读一遍。` : `看 ${n} 号货架。`, calls: [{ name: 'read', args: { path: `stock-${n}.md` } }] });
        const firstPass = [1, 2, 3, 4, 5, 6].map((n) => look(n));
        return [
          {
            kind: 'chat',
            label: '',
            user: '掌柜',
            prompt: '盘点单在 stock-1.md 到 stock-6.md 里，一个货架一份。六个货架一共缺多少件货？哪个货架缺得最多？',
            tools: ['read'],
            capacity: CABIN,
            system: () => SHOP_PROMPT,
            shape: windowed ? slidingWindow : compressed ? compressor('缺货', CABIN, estimateTokens) : null,
            puppet: windowed ? [...firstPass, ...[1, 2, 3, 4, 5, 6, 1].map((n) => look(n, true))] : [...firstPass, { text: `六个货架一共缺 ${STOCK_TOTAL} 件货。缺得最多的是 5 号货架，缺 9 件。` }],
          },
        ];
      },
      judge: ({ finalText }) => new RegExp(`(^|[^0-9])${STOCK_TOTAL}\\s*件`).test(finalText) && /5\s*号|货架\s*5|第五|stock-5/.test(finalText),
      diagnose: (parts) => (has(parts, 'window') ? 'window-amnesia' : !has(parts, 'compress') ? 'cabin-full' : 'miss'),
      failLine: {
        'cabin-full': '盘点到一半，你的站没声了：上下文舱装不下了。六份单子，它连四份都没读完。',
        'window-amnesia': '你的站把六份盘点单翻来覆去读了十几遍，一个数也没报出来，最后被强制叫停。',
        miss: '两个数里还有不对的。',
      },
      winLine: '一共缺 25 件，5 号货架缺得最多。六份单子读完，舱里还有富余。',
    },
  ];
}
