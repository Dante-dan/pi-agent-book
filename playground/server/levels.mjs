// 任务定义：玩家是 Harness 的设计师。
// 每个任务规定：地面指挥要什么、有哪些零件可装、木偶模型在各种装配下怎么演、
// 地面怎么验收，以及每一种失败对应的“事故调查”。
// 这里没有任何用户输入，全部是固定数据。

const SYSTEM_PROMPT = [
  '你是「π 工坊」空间站上的演示 Agent，在一个只有虚拟文件的工作目录里干活。',
  '用户用什么语言提问，就用什么语言回答，尽量简洁。没有读到的数据不要编造；工具报错时，根据报错内容换个办法再试。',
].join('\n');

const ORDERS = [
  { id: 'A001', item: '冰红茶', status: 'paid', amountCents: 350 },
  { id: 'A002', item: '辣条', status: 'paid', amountCents: 500 },
  { id: 'A003', item: '泡面', status: 'refunded', amountCents: 450 },
  { id: 'A004', item: '矿泉水', status: 'paid', amountCents: 200 },
  { id: 'A005', item: '火腿肠', status: 'pending', amountCents: 300 },
  { id: 'A006', item: '薯片', status: 'paid', amountCents: 850 },
  { id: 'A007', item: '口香糖', status: 'refunded', amountCents: 600 },
  { id: 'A008', item: '酸奶', status: 'paid', amountCents: 1200 },
];
const ORDERS_JSON = '[\n' + ORDERS.map((o) => '  ' + JSON.stringify(o)).join(',\n') + '\n]\n';
export const TRUTH = {
  paidCount: ORDERS.filter((o) => o.status === 'paid').length,
  paidTotalCents: ORDERS.filter((o) => o.status === 'paid').reduce((sum, o) => sum + o.amountCents, 0),
};

const REPORT_README = [
  '# 小卖部日结说明',
  '',
  '把统计结果写进 report.json，格式固定为：',
  '',
  '{"paidCount": 已支付订单笔数, "paidTotalCents": 已支付金额合计（单位：分）}',
  '',
  '如果有 check 工具，写完后调用它验收；验收不通过就改到通过为止。',
  '',
].join('\n');

/** 零件：玩家能往空间站上装的东西。tool 表示它同时是给模型的一个工具。 */
export const PARTS = {
  read: { id: 'read', name: 'read 工具', kind: 'tool', tool: 'read', blurb: '让主脑能开口要一份文件的内容。' },
  loop: { id: 'loop', name: '循环', kind: 'core', blurb: '工具结果回舱之后，自动再呼叫一次主脑。' },
  write: { id: 'write', name: 'write 工具', kind: 'tool', tool: 'write', blurb: '让主脑能把内容写进文件。' },
  check: { id: 'check', name: '验收信标', kind: 'tool', tool: 'check', blurb: '一段不会被说服的程序，拿报告和账本逐项核对。' },
};

/** 事故：一种失败 + 一道“它为什么失败”的谜题 + 破案后解锁的零件与概念。 */
export const INCIDENTS = {
  blind: {
    id: 'blind',
    title: '它在胡说',
    question: '问题出在哪？',
    hint: '线索在机器里：点开上下文舱里的每一块，看看主脑到底收到了什么。再看看数据舱里的文件有没有被碰过。',
    options: [
      { id: 'a', text: '主脑不够聪明，换个更大的模型就好', why: '再聪明的模型，也读不到一份没给它的文件。' },
      { id: 'b', text: '提问里没说清楚文件在哪', why: '提问里写了 orders.json。可对主脑来说，那只是几个字，不是文件的内容。' },
      { id: 'c', text: '上下文舱里根本没有文件内容', correct: true },
      { id: 'd', text: 'orders.json 损坏了', why: '数据舱里的文件好好的，只是从头到尾没人碰过它。' },
    ],
    unlock: 'read',
    concept: {
      title: '工具',
      text: '主脑只知道两样东西：训练时读过的，和此刻上下文舱里装着的。你的文件两样都不是。工具给了它第三条路：开口要。它自己不会读文件，只会说“请帮我读”，真正去读的是你设计的这座空间站。',
      anchor: 'c-tool',
    },
  },
  'no-loop': {
    id: 'no-loop',
    title: '一片寂静',
    question: '文件明明读回来了，为什么没有答复？',
    hint: '看上下文舱的最后一块是什么。再数一数：主脑一共被呼叫了几次？',
    options: [
      { id: 'a', text: 'read 工具坏了，没读到内容', why: '上下文舱最后一块就是文件内容，读得很完整。' },
      { id: 'b', text: '结果回到了上下文舱，但没人再呼叫主脑', correct: true },
      { id: 'c', text: '主脑读完文件后卡死了', why: '主脑只被呼叫了一次，那一次它说的是“请帮我读文件”。之后没人再找过它，它根本没机会读。' },
      { id: 'd', text: '文件太大，主脑处理不了', why: '这份文件只有几百个字。它不是处理不了，是没被叫起来处理。' },
    ],
    unlock: 'loop',
    concept: {
      title: 'Agent 循环',
      text: '主脑每次被呼叫，只说一段话就结束。它说完“请帮我读文件”，这一次呼叫就完了。得有人在结果回舱之后再呼叫它一次，并且把之前的一切原样再给它看一遍，因为它不记得上一次。这个“再来一次”，就是循环。',
      anchor: 'c-loop',
    },
  },
  'no-hands': {
    id: 'no-hands',
    title: '有心无力',
    question: '它算对了，为什么任务还是失败？',
    hint: '读一读主脑最后那句话。再看看数据舱：里面多出 report.json 了吗？',
    options: [
      { id: 'a', text: '它其实算错了', why: '5 笔、3100 分，和账本一致。' },
      { id: 'b', text: '它没有能写文件的工具', correct: true },
      { id: 'c', text: 'README 没说要写文件', why: 'README 写得很清楚：把结果写进 report.json。主脑也读到了。' },
      { id: 'd', text: '循环提前停了', why: '循环停得没毛病：主脑不再要工具，所以结束。它不是不想写，是没东西可用。' },
    ],
    unlock: 'write',
    concept: {
      title: '动作',
      text: 'read 让它看见世界，write 让它改变世界。只能看不能动的 Agent，充其量是个解说员。给它什么工具，就等于划定了它能做到什么。',
      anchor: 'c-action',
    },
  },
  'no-verify': {
    id: 'no-verify',
    title: '它说完成了',
    question: '这套设计缺了什么？',
    hint: '地面拿账本核对过了。问题是：在你的空间站里，有谁核对过吗？主脑凭什么说“完成”？',
    options: [
      { id: 'a', text: '缺一个更诚实的模型', why: '它没有撒谎。它确实写了报告，也确实不知道报告对不对。' },
      { id: 'b', text: '缺一个不听它怎么说、只核对结果的环节', correct: true },
      { id: 'c', text: '缺第二个模型来复查一遍', why: '另一个模型同样可能被一份看起来很像样的报告说服。先用最笨、最硬的办法：拿账本逐项核对。' },
      { id: 'd', text: '缺一段更长的提示词', why: '叮嘱它“要仔细”不会让错的变成对的。它需要的是一个能告诉它“错了，错在哪”的东西。' },
    ],
    unlock: 'check',
    concept: {
      title: '验收',
      text: '别问模型“做完了吗”，给它一个能自己去按的验收按钮。验收不通过的原因会像普通结果一样落回上下文舱，下一次呼叫时主脑就能读到，然后自己改。动作的结果回到做决定的地方，这叫闭环。',
      anchor: 'c-verify',
    },
  },
  miss: {
    id: 'miss',
    title: '这次没通过',
    question: null,
    hint: '零件是齐的，但这一次没做对。真模型每次的走法都不一样：点开日志看看它卡在哪一步，然后再发射一次。',
    options: [],
    unlock: null,
    concept: null,
  },
};

const has = (parts, id) => parts.includes(id);

export const MISSIONS = [
  {
    id: '1-1',
    station: '1',
    title: '第一单',
    objective: '让空间站答出：小卖部今天已支付的订单一共收了多少钱。',
    briefing: '这里是地面指挥。小卖部要日结，订单都记在 orders.json 里。你的空间站得告诉我，今天已支付的一共多少钱。零件舱里有什么就先用什么。',
    prompt: '小卖部今天已支付的订单一共收了多少钱？数据在 orders.json 里。',
    files: { 'orders.json': ORDERS_JSON },
    allowed: ['read', 'loop'],
    incidents: ['blind', 'no-loop'],
    puppet(parts) {
      if (!has(parts, 'read')) return [{ text: '已支付订单合计 128.50 元，共 23 笔，客单价约 5.59 元。需要我按品类再拆一下吗？' }];
      return [
        { text: '我先读一下订单文件。', calls: [{ name: 'read', args: { path: 'orders.json' } }] },
        { text: '已支付 5 笔，合计 31.00 元（3100 分）。A003、A007 已退款，A005 还没付，都没算进去。' },
      ];
    },
    judge: ({ stats }) => /31(\.0+)?\s*元|3[,，]?100\s*分|¥\s*31\b|31\.00/.test(stats.finalText),
    failLine: {
      blind: '账本上一共只有 8 笔订单，你的站报了 23 笔。它在胡说。',
      'no-loop': '我等了半天，你的站一个字都没回。',
      miss: '答案和账本对不上。',
    },
    winLine: '31.00 元，和账本一致。第一单交付。',
  },
  {
    id: '1-2',
    station: '1',
    title: '白纸黑字',
    objective: '按 README.md 生成 report.json，并且必须在站内验收通过。',
    briefing: '光嘴上报数不行，我要一份文件。按 README.md 的格式把日结写进 report.json。还有一条：交付前你的站必须自己验收过，我不收“我觉得没问题”的报告。',
    prompt: '按 README.md 的要求做今天的日结：把结果写进 report.json，做到验收通过为止。',
    files: { 'orders.json': ORDERS_JSON, 'README.md': REPORT_README },
    allowed: ['read', 'loop', 'write', 'check'],
    incidents: ['blind', 'no-loop', 'no-hands', 'no-verify'],
    puppet(parts) {
      if (!has(parts, 'read')) return [{ text: '日结已完成，report.json 已生成：共 23 笔，合计 128.50 元。' }];
      const readBoth = {
        text: '先看说明和订单。',
        calls: [
          { name: 'read', args: { path: 'README.md' } },
          { name: 'read', args: { path: 'orders.json' } },
        ],
      };
      if (!has(parts, 'write')) return [readBoth, { text: '我算出来了：已支付 5 笔，合计 3100 分。但我没有能写文件的工具，没法生成 report.json。' }];
      const wrong = { text: '8 笔订单，合计 4450 分。写入报告。', calls: [{ name: 'write', args: { path: 'report.json', content: '{"paidCount": 8, "paidTotalCents": 4450}\n' } }] };
      if (!has(parts, 'check')) return [readBoth, wrong, { text: '日结完成 ✅ report.json 已生成：8 笔，合计 44.50 元。' }];
      return [
        readBoth,
        wrong,
        { calls: [{ name: 'check', args: {} }] },
        {
          text: '验收没过。我把退款和未支付的也算进去了，只有 status 为 paid 的才算收入。重算：5 笔，3100 分。',
          calls: [{ name: 'write', args: { path: 'report.json', content: '{"paidCount": 5, "paidTotalCents": 3100}\n' } }],
        },
        { calls: [{ name: 'check', args: {} }] },
        { text: '日结完成，验收通过：已支付 5 笔，合计 31.00 元。第一版把退款单也算了进去，已更正。' },
      ];
    },
    judge: ({ stats, reportCorrect }) => reportCorrect && stats.checkPassed,
    failLine: {
      blind: '你的站说报告生成了。我这边什么文件都没收到，数字还是错的。',
      'no-loop': '我等了半天，你的站一个字都没回，文件也没有。',
      'no-hands': '数是对的，可我要的是 report.json。文件呢？',
      'no-verify': null, // 由 reportCorrect 决定，见 failLineFor
      miss: '交付不合格：要么报告不对，要么没验收过。',
    },
    winLine: '报告和账本一致，而且是你的站自己验收过的。这才叫交付。',
  },
];

export function failLineFor(mission, incident, reportCorrect) {
  if (incident === 'no-verify') {
    return reportCorrect ? '报告这次碰巧是对的。可你的站凭什么知道它是对的？没验收过的我不收。' : '我拿账本核对过了：报告是错的。可你的站刚才说“日结完成”。';
  }
  return mission.failLine[incident] ?? mission.failLine.miss;
}

export const STATIONS = [
  { id: '1', no: '01', title: '缸中之脑长出手', topic: 'AI Agent 入门', line: '从一颗只会说话的主脑开始，把它逼成一个能交付的 Agent。', chapter: '01-agent-loop', open: true },
  { id: '2', no: '02', title: '货舱管理学', topic: '上下文工程', line: '主脑只认上下文舱里的东西。装什么、装多少、什么时候清，全是学问。', open: false },
  { id: '3', no: '03', title: '好记性与烂笔头', topic: '用户记忆与知识库', line: '从番茄炒蛋搜不到西红柿炒蛋说起，一路走到知识图谱。', open: false },
  { id: '4', no: '04', title: '十八般兵器', topic: '工具', line: '工具对主脑来说只是一段说明书。说明书写得好坏，决定它会不会用。', open: false },
  { id: '5', no: '05', title: '会写代码的万能工', topic: 'Coding Agent 与通用 Agent', line: '代码是能造工具的工具。', open: false },
  { id: '6', no: '06', title: '耳目与手脚', topic: '交互：观察与动作空间', line: '语音、屏幕、异步事件：让 Agent 不只会打字。', open: false },
  { id: '7', no: '07', title: '拉出来遛遛', topic: 'Agent 的评估', line: '感觉变好了不算数，得有一把量得出来的尺子。', open: false },
  { id: '8', no: '08', title: '回炉重造', topic: '模型后训练', line: '什么时候该改提示词，什么时候该改模型本身。', open: false },
  { id: '9', no: '09', title: '吃一堑长一智', topic: 'Agent 的持续进化', line: '把翻过的车变成下次不翻的理由。', open: false },
  { id: '10', no: '10', title: '三个臭皮匠', topic: '多 Agent 协作', line: '什么时候该分工，什么时候分工只是添乱。', open: false },
  { id: 'S', no: 'S', title: '画地为牢', topic: '专题：沙盒', line: '给 Agent 一台电脑之前，先想清楚墙砌在哪儿。', open: false },
];

export function getMission(id) {
  return MISSIONS.find((mission) => mission.id === id);
}

export { SYSTEM_PROMPT };

/** 发给前端的世界描述：不含函数。 */
export function publicWorld() {
  return {
    parts: PARTS,
    incidents: INCIDENTS,
    stations: STATIONS.map((station) => ({
      ...station,
      missions: MISSIONS.filter((mission) => mission.station === station.id).map((mission) => ({
        id: mission.id,
        title: mission.title,
        objective: mission.objective,
        briefing: mission.briefing,
        prompt: mission.prompt,
        allowed: mission.allowed,
        files: Object.keys(mission.files),
        winLine: mission.winLine,
      })),
    })),
  };
}
