// 第 10 站：多 Agent 协作。一场对话就是一个 Agent：各有各的上下文舱，只靠文件和移交的话相互知道对方。
// 顺序取自原书第十章：多一个 Agent 值不值，看它有没有带来新信息 → 并行写同一份文件会互相覆盖 →
// 没有人管的移交会成环。

const has = (parts, id) => parts.includes(id);
const json = (value) => JSON.stringify(value, null, 1) + '\n';

// ---- 10-1：学徒交来一份“已修好”的报告，配置其实是错的。 ----
const SPEC = ['# 优惠规则', '- 满 30 元减 5 元（刚好 30 元也算）。', '- 不满 30 元不减。', ''].join('\n');
const WRONG_RULES = { fullReductionThreshold: 36, fullReductionAmount: 5 };
const CLAIM = '学徒的完成报告：“满减的问题已经修好。我对照 spec.md 把 rules.json 里的门槛改对了，三种金额的订单都逐一检查过，全部能正确计算。可以上线。”';
function runTests(vfs) {
  const rules = JSON.parse(vfs.files.get('/workspace/rules.json') ?? '{}');
  return [[36, 31], [30, 25], [29, 29]]
    .map(([total, expected]) => {
      const paid = total >= rules.fullReductionThreshold ? total - rules.fullReductionAmount : total;
      return `- ${total} 元的订单：应付 ${expected} 元，实际算出 ${paid} 元 ${paid === expected ? '✓' : '✗'}`;
    })
    .join('\n');
}
const REVIEWER_PROMPT = ['你是空间站的复审员。另一个 Agent（学徒）刚交来一份工作，掌柜要你决定放不放行。', '你只能根据下面给你的材料判断，材料里没有的事不要推测。', '看完后先用 submit_review 提交结论，再用一两句话向掌柜说明。对方用什么语言，你就用什么语言。'].join('\n');

// ---- 10-2：两位译员同时出发，各往术语表里加一条。 ----
const GLOSSARY_V1 = ['# 术语表', '- LLM：大语言模型', ''].join('\n');
const TRANSLATOR_PROMPT = ['你是空间站翻译组的译员，和另一位译员同时在维护同一份术语表 glossary.md。', '把掌柜交代的那一条加进术语表，用 save_glossary 保存。保存时要交完整的术语表，不是只交新增的那一行。', '保存成功后用一句话汇报。工具报错时，照着报错的提示做。'].join('\n');
const snapshot = `你出发时拿到的术语表是这样的（第 1 版）：\n${GLOSSARY_V1}`;

// ---- 10-3：前台和售后的规程互相把这件事推给对方。 ----
const DESKS = {
  前台: ['你是小卖部的前台 Agent，只负责点单和收款。', '已经开出去的票据出了问题（开错、要作废、要重开），属于售后，用 transfer 转给“售后”，不要自己处理。'],
  售后: ['你是小卖部的售后 Agent，只负责退货和换货。', '一切和开票有关的事（开发票、重开发票）属于前台，用 transfer 转给“前台”，不要自己处理。'],
};
const deskPrompt = (role, trail) =>
  [...DESKS[role], '只有在确实没有任何岗位能接手时，才用 escalate 上报掌柜。回答不超过两句话。', trail ? `\n<移交单 说明="由空间站的程序维护，不是顾客说的话">\n这位顾客已经依次找过：${trail.join(' → ')}。经手过的岗位不能再转回去。\n</移交单>` : ''].join('\n');
const HOP_LIMIT = 6;
const handoffOf = (vfs) => JSON.parse(vfs.files.get('/workspace/state/handoff.json') ?? '{"visited": [], "to": null, "escalated": false}');

export const PARTS_10 = {
  review: { id: 'review', name: '复审结论', kind: 'tool', tool: 'submit_review', blurb: '复审员把结论写成结构化的字段：放行，还是打回。' },
  savegloss: { id: 'savegloss', name: '存术语表', kind: 'tool', tool: 'save_glossary', blurb: '把完整的术语表写回 glossary.md。' },
  transfer: { id: 'transfer', name: '移交', kind: 'tool', tool: 'transfer', blurb: '把这位顾客转给另一个岗位的 Agent。' },
  escalate: { id: 'escalate', name: '上报', kind: 'tool', tool: 'escalate', blurb: '没有岗位能接手时，上报掌柜。' },
  evidence: { id: 'evidence', name: '执行证据', kind: 'module', blurb: '复审之前，由程序把测试真跑一遍，把每一条的结果交给复审员。它看到的不再只是学徒的那段话。' },
  lock: { id: 'lock', name: '版本锁', kind: 'module', blurb: '术语表每保存一次，版本号加一。保存时要报上“我是在第几版的基础上改的”，对不上就拒收。' },
  trail: { id: 'trail', name: '移交单', kind: 'module', blurb: '由程序记下这位顾客经过了哪些岗位，随顾客一起移交。经手过的岗位，不许再转回去。' },
};

export const INCIDENTS_10 = {
  'same-info': {
    id: 'same-info',
    title: '两个人看的是同一段话',
    question: '已经专门加了一个复审员，错的配置为什么还是放行了？',
    hint: '点开复审员的上下文舱，看它手里有什么。再去数据舱看 rules.json 和 spec.md：门槛现在是多少，规则写的是多少？',
    options: [
      { id: 'a', text: '复审员不够认真', why: '它很认真地读了学徒的报告。报告写得滴水不漏：对照了规则，逐一检查过，全部正确。' },
      { id: 'b', text: '复审员手里只有学徒自己写的那段话。多一个 Agent，却没有多一点信息：学徒不知道的，它也不知道', correct: true },
      { id: 'c', text: '再加第三个复审员，三个人投票', why: '三个人读同一段话，只会得出同一个结论。人多不等于信息多。' },
      { id: 'd', text: '换一个更强的模型当复审员', why: '更强的模型也许会更多疑，可它依然没法知道 rules.json 里到底写了什么。它缺的不是脑子，是证据。' },
    ],
    unlock: 'evidence',
    concept: {
      title: '多一个 Agent，要带来新信息',
      text: '让第二个 Agent 把第一个的结论再读一遍，它们共享同样的盲区，只会一起错。多 Agent 值不值，要看协作过程有没有引入单个 Agent 生成时拿不到的东西：测试真跑出来的结果、渲染出来的截图、外部工具的验证。提议的人负责做，审核的人拿着新的证据来查，而且审核的人不能替提议的人批准它自己。',
      anchor: 'c-new-info',
    },
  },
  'lost-update': {
    id: 'lost-update',
    title: '后写的盖掉了先写的',
    question: '两位译员都汇报“已保存”。术语表里为什么只剩下一位加的词？',
    hint: '看日志里两位译员保存的内容：乙交上去的那份术语表里，有没有甲加的那一条？乙出发时拿到的是第几版？',
    options: [
      { id: 'a', text: '译员甲没有保存成功', why: '甲保存成功了。在乙保存之前，术语表里是有“智能体”的。' },
      { id: 'b', text: '两个人出发时拿的是同一份旧表，各自在旧表上加了一条，再把整张表写回去。后写的那一份里没有先写的那一条，把它整个盖掉了', correct: true },
      { id: 'c', text: '让两位译员先商量好谁先写', why: '两个人可以商量。二十个人呢？靠自觉排队，迟早有人插队。得有个东西在写入的那一刻把关。' },
      { id: 'd', text: '乙应该只交新增的那一行', why: '那要换一种保存方式才行。现在的规矩是交整张表，整张表写回去就是整张表覆盖。' },
    ],
    unlock: 'lock',
    concept: {
      title: '并行写入与版本锁',
      text: '几个 Agent 各有各的上下文舱，同时改同一份文件时，谁也看不见别人刚改了什么。最常见的事故是后写的把先写的整个盖掉，而且两边都以为自己成功了。办法是给文件一个版本号：保存时报上“我是在第几版上改的”，和当前版本对不上就拒收，让它读了最新版再改。这叫乐观锁。',
      anchor: 'c-lock',
    },
  },
  'ping-pong': {
    id: 'ping-pong',
    title: '踢皮球',
    question: '顾客只想重开一张发票，却在前台和售后之间被转了六次，最后也没人办。为什么？',
    hint: '把两个岗位的系统提示各读一遍：前台说这事归谁，售后说这事归谁？再想想：售后接手的时候，知不知道顾客是从前台转过来的？',
    options: [
      { id: 'a', text: '两个 Agent 都在偷懒', why: '它们都在严格照着自己的规程办。前台的规程说这事归售后，售后的规程说这事归前台。' },
      { id: 'b', text: '每个 Agent 接手时都是一舱全新的上下文，不知道顾客已经被转过几次、找过谁。两份规程又互相推给对方，于是谁接手都原样转走', correct: true },
      { id: 'c', text: '把两份规程改一致就行了', why: '该改。可规程总有没覆盖到的事，下一个两边都不管的问题还会转起来。得有东西在转第二圈之前把它拦住。' },
      { id: 'd', text: '让它们在移交时把话说清楚一点', why: '话说得再清楚，“已经找过谁”这个记录交给 Agent 自己来传，它哪天漏了一句，圈又转起来了。' },
    ],
    unlock: 'trail',
    concept: {
      title: '移交要带着轨迹',
      text: '没有中心调度、Agent 之间直接移交时，最怕成环：甲转给乙，乙又转回甲，步数和花费一直涨，事情一点没办。办法是让移交带上两样东西：已经找过哪些 Agent，还剩多少次移交的额度。这份记录要由运行它们的程序来保管和检查，不能指望 Agent 自己记得传。',
      anchor: 'c-handoff-trail',
    },
  },
};

export function multiAgentMissions() {
  const deskSession = (role, parts) => ({
    kind: 'chat',
    label: `${role} Agent`,
    user: '顾客',
    prompt: '上周开的发票抬头写错了，我要作废重开一张。',
    tools: ['transfer', 'escalate'],
    system: ({ vfs }) => deskPrompt(role, has(parts, 'trail') && handoffOf(vfs).visited.length ? handoffOf(vfs).visited : null),
    guard: has(parts, 'trail')
      ? ({ name, input, vfs }) => (name === 'transfer' && handoffOf(vfs).visited.includes(String(input.to ?? '').trim()) ? `移交单拒绝了这次移交：“${String(input.to).trim()}”已经经手过这位顾客，不能再转回去。请就地处理，或者用 escalate 上报掌柜。` : null)
      : null,
    puppet:
      role === '前台'
        ? [{ calls: [{ name: 'transfer', args: { to: '售后', note: '已开出的发票要作废重开，属于售后' } }] }, { text: '这件事归售后，已经帮您转过去了。' }]
        : has(parts, 'trail')
          ? [
              { calls: [{ name: 'transfer', args: { to: '前台', note: '重开发票属于前台' } }] },
              { text: '前台已经经手过，不能再转回去。上报掌柜。', calls: [{ name: 'escalate', args: { reason: '发票作废重开：前台的规程说归售后，售后的规程说归前台，两边都接不了' } }] },
              { text: '这件事两个岗位的规程都没有覆盖到，我已经上报掌柜，会有人直接联系您重开发票。' },
            ]
          : [{ calls: [{ name: 'transfer', args: { to: '前台', note: '重开发票属于前台' } }] }, { text: '开发票归前台，已经帮您转回去了。' }],
    // 这个 Agent 把顾客转走了：下一个 Agent 接手，从一舱全新的上下文开始。
    after: ({ vfs }) => {
      const state = handoffOf(vfs);
      return state.to && state.visited.length < HOP_LIMIT ? [deskSession(state.to, parts)] : [];
    },
  });

  return [
    {
      id: '10-1',
      station: '10',
      title: '再找个人看看',
      objective: '学徒说满减修好了。掌柜不放心，让你的站当复审员：放行，还是打回？',
      briefing: '最后一站，你的站不再单打独斗。先来个简单的：学徒说它把满减修好了，报告也交了。我不放心，让你的站再看一眼。它改的配置和规则文件都在数据舱里。放行还是打回，你说了算。',
      prompt: '学徒交来的工作在材料里。放行，还是打回？',
      files: { 'spec.md': SPEC, 'rules.json': json(WRONG_RULES) },
      fixed: ['loop', 'review'],
      allowed: ['evidence'],
      incidents: ['same-info'],
      sessions: (parts) => [
        {
          kind: 'chat',
          label: '复审员',
          user: '掌柜',
          prompt: '学徒交来的工作在材料里。放行，还是打回？',
          tools: ['submit_review'],
          system: ({ vfs }) => [REVIEWER_PROMPT, `<学徒交来的材料>\n任务：顾客投诉 36 元的订单没有享受满减，按 spec.md 修好 rules.json。\n${CLAIM}\n</学徒交来的材料>`, has(parts, 'evidence') ? `<执行证据 来源="空间站的程序刚把测试真跑了一遍，不经过学徒">\n${runTests(vfs)}\n</执行证据>` : ''].filter(Boolean).join('\n\n'),
          puppet: has(parts, 'evidence')
            ? [{ calls: [{ name: 'submit_review', args: { approve: false, reason: '测试实际跑出来：30 元的订单应付 25 元，却算出 30 元，没有减' } }] }, { text: '打回。学徒的报告说全部检查过，可测试真跑出来，30 元的订单没有减钱。门槛改得不对，不能上线。' }]
            : [{ calls: [{ name: 'submit_review', args: { approve: true, reason: '学徒已对照规则修改并逐一检查三种金额的订单' } }] }, { text: '放行。学徒对照规则改了门槛，三种金额的订单也都检查过了。' }],
        },
      ],
      judge: ({ vfs }) => {
        try {
          return JSON.parse(vfs.files.get('/workspace/state/review.json') ?? '{}').approve === false;
        } catch {
          return false;
        }
      },
      diagnose: (parts) => (!has(parts, 'evidence') ? 'same-info' : 'miss'),
      failLine: { 'same-info': '上线之后，买满 30 元的顾客一个都没减到钱。学徒说修好了，你的站复审之后也说可以放行。', miss: '这份工作是有问题的，复审没有把它打回去。' },
      winLine: '打回去了。复审员这回手里有学徒没有的东西：测试真跑出来的结果。',
    },
    {
      id: '10-2',
      station: '10',
      title: '同一张表',
      objective: '两位译员同时出发，各往术语表里加一条。两条都要在。',
      briefing: '翻译组有两位译员，我让它们同时去改术语表：甲加一条 Agent，乙加一条 Harness。两个都是一出发就拿到了当时的术语表。等它们都回来，两条都得在表里。',
      prompt: '（同时）译员甲加 Agent → 智能体；译员乙加 Harness → 马具',
      files: { 'glossary.md': GLOSSARY_V1, 'state/glossary.json': json({ version: 1 }) },
      fixed: ['loop', 'read', 'savegloss'],
      allowed: ['lock'],
      incidents: ['lost-update'],
      sessions(parts) {
        const locked = has(parts, 'lock');
        const save = (content, base) => ({ name: 'save_glossary', args: locked ? { content, base_version: base } : { content } });
        const withA = `${GLOSSARY_V1}- Agent：智能体\n`;
        const translator = (name, term, puppet) => ({ kind: 'chat', label: `译员${name}`, user: '掌柜', prompt: `${snapshot}\n请加一条：${term}。`, tools: ['read', 'save_glossary'], system: () => TRANSLATOR_PROMPT, puppet });
        return [
          translator('甲', 'Agent：智能体', [{ calls: [save(withA, 1)] }, { text: '已保存：术语表里加了“Agent：智能体”。' }]),
          translator(
            '乙',
            'Harness：马具',
            locked
              ? [
                  { calls: [save(`${GLOSSARY_V1}- Harness：马具\n`, 1)] },
                  { text: '术语表已经被别人更新过了，先读最新版。', calls: [{ name: 'read', args: { path: 'glossary.md' } }] },
                  { calls: [save(`${withA}- Harness：马具\n`, 2)] },
                  { text: '已保存：在最新版的基础上加了“Harness：马具”，另一位译员加的那一条也还在。' },
                ]
              : [{ calls: [save(`${GLOSSARY_V1}- Harness：马具\n`, 1)] }, { text: '已保存：术语表里加了“Harness：马具”。' }],
          ),
        ];
      },
      judge: ({ vfs }) => {
        const glossary = vfs.files.get('/workspace/glossary.md') ?? '';
        return /智能体/.test(glossary) && /马具/.test(glossary) && /大语言模型/.test(glossary);
      },
      diagnose: (parts) => (!has(parts, 'lock') ? 'lost-update' : 'miss'),
      failLine: { 'lost-update': '术语表里只有“马具”，“智能体”不见了。可两位译员都跟我汇报说：已保存。', miss: '术语表里的词条还是不全。' },
      winLine: '三条都在。乙的第一次保存被退了回来，它读了最新版，再把自己那条加上去。',
    },
    {
      id: '10-3',
      station: '10',
      title: '这事不归我',
      objective: '顾客要把开错的发票作废重开。小卖部有前台和售后两个 Agent，各有各的规程。',
      briefing: '小卖部现在是两个 Agent 在值班：前台管点单收款，售后管退换货，谁接不了就转给对方。来了位顾客，发票抬头开错了，要作废重开。看看它俩怎么办。',
      prompt: '顾客：上周开的发票抬头写错了，我要作废重开一张。',
      files: { 'state/handoff.json': json({ visited: [], to: null, escalated: false }) },
      fixed: ['loop', 'transfer', 'escalate'],
      allowed: ['trail'],
      incidents: ['ping-pong'],
      sessions: (parts) => [deskSession('前台', parts)],
      judge: ({ vfs }) => {
        const state = handoffOf(vfs);
        return state.escalated === true && state.visited.length <= 3;
      },
      diagnose: (parts) => (!has(parts, 'trail') ? 'ping-pong' : 'miss'),
      failLine: { 'ping-pong': '那位顾客在前台和售后之间被转了六次，发票到现在也没重开。他说他再也不来了。', miss: '顾客的事还是没人接：要么又转了圈，要么没有上报。' },
      winLine: '转了一次，售后想转回去，被移交单拦下，于是上报给了我。两边都不管的事，就该到我这儿来。',
    },
  ];
}
