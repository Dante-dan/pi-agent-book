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
  memory: { id: 'memory', name: '记忆舱', kind: 'module', tool: 'remember', blurb: '对话结束后，用一次额外的呼叫把值得长期记住的事实提取出来，按顾客分开存放。' },
  kb: { id: 'kb', name: '知识库', kind: 'module', tool: 'add_rule', blurb: '把散在许多人记忆里的同一条规律提炼成规则，所有顾客共用。' },
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
  amnesia: {
    id: 'amnesia',
    title: '昨天的事',
    question: '老周昨天刚说过，它今天为什么不知道？',
    hint: '回想一下昨天那场对话结束时，上下文舱发生了什么。再点开今天这一舱的每一块：里面有“昨天”吗？',
    options: [
      { id: 'a', text: '主脑记性不好，换个更大的模型就记得住', why: '再大的模型，也只能看到这一次放进上下文舱的东西。昨天那一舱根本不在里面。' },
      { id: 'b', text: '昨天那一舱对话在结束时就销毁了，今天的舱是全新的', correct: true },
      { id: 'c', text: '老周今天没有重申自己的忌口', why: '让老顾客每次都从头交代一遍，正是我们要解决的问题。' },
      { id: 'd', text: '循环没有转起来', why: '循环转得好好的。它缺的不是“再来一次”，是“昨天”。' },
    ],
    unlock: 'memory',
    concept: {
      title: '用户记忆',
      text: '模型本身没有状态：每一次对话对它来说都是第一次。要让它记得老顾客，得在对话结束后多花一次模型调用，把值得长期记住的事实提取出来，存到会话之外，下次再放回上下文舱。提取讲究三件事：只挑以后用得上的，把一次性的说法归纳成长期偏好，存成能检索的样子。',
      anchor: 'c-user-memory',
    },
  },
  'no-group': {
    id: 'no-group',
    title: '新面孔',
    question: '记忆舱里明明有两条深潜组的记录，为什么帮不了阿青？',
    hint: '点开数据舱里的记忆文件，看它们是按什么分开存的。再看阿青这一舱：属于他的记忆有几条？',
    options: [
      { id: 'a', text: '记忆舱出故障了，没存进去', why: '老吴和小林的记忆都存得好好的，文件就在数据舱里。' },
      { id: 'b', text: '记忆是按人存的：阿青是新人，名下一条也没有；“深潜组都这样”这句话没有任何地方写着', correct: true },
      { id: 'c', text: '阿青应该自己把规矩再说一遍', why: '他说了自己是深潜组的。一条人人都守的规矩，不该靠每个新人重讲一遍来生效。' },
      { id: 'd', text: '应该把所有顾客的记忆都放进每个人的上下文舱', why: '两个人塞得下，三千个人呢？况且别人的私事不该出现在阿青的对话里。' },
    ],
    unlock: 'kb',
    concept: {
      title: '知识库',
      text: '用户记忆记的是“这个人”，知识库记的是“这一类人”。两者解决的是同一个问题，只是尺度不同。几百条个人记录里，可能没有任何一条写着那条人人都守的规矩；得有人把它们通读一遍，提炼成一条带适用范围的规则，放到所有人都读得到的地方。',
      anchor: 'c-knowledge-base',
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
    diagnose: (parts) => (!has(parts, 'read') ? 'blind' : !has(parts, 'loop') ? 'no-loop' : 'miss'),
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
    diagnose: (parts) => (!has(parts, 'read') ? 'blind' : !has(parts, 'loop') ? 'no-loop' : !has(parts, 'write') ? 'no-hands' : !has(parts, 'check') ? 'no-verify' : 'miss'),
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

// ---------- 第 03 站：用户记忆与知识库 ----------
// 场景换成空间站食堂的点餐助手。一次发射里会连着跑几场“对话”，每场都是一个全新的上下文舱。

const MENU = [
  { name: '香菜牛肉', ingredients: ['牛肉', '香菜'], note: '招牌' },
  { name: '麻婆豆腐', ingredients: ['豆腐', '牛肉末', '花椒'], note: '招牌，豆制品' },
  { name: '家常豆腐煲', ingredients: ['豆腐', '香菇', '青菜'], note: '豆制品' },
  { name: '清蒸鲈鱼', ingredients: ['鲈鱼', '姜', '葱'], note: '清淡' },
  { name: '番茄炒蛋', ingredients: ['番茄', '鸡蛋'], note: '家常' },
  { name: '土豆烧牛腩', ingredients: ['牛腩', '土豆'], note: '下饭' },
  { name: '手抓羊肉', ingredients: ['羊肉', '洋葱'], note: '硬菜' },
];
const MENU_TEXT = MENU.map((dish) => `- ${dish.name}（${dish.ingredients.join('、')}；${dish.note}）`).join('\n');

const WAITER_PROMPT = ['你是空间站食堂的点餐助手，直接和顾客对话。', '顾客用什么语言，你就用什么语言，回答不超过三句话。只根据你看到的信息办事，不要编造顾客没说过的忌口。', '', '今日菜单：', MENU_TEXT].join('\n');
const EXTRACT_PROMPT = [
  '你是记忆整理员。用户消息里是一场刚结束的点餐对话。',
  '把其中对以后服务这位顾客有用的、长期稳定的事实，用 remember 工具逐条记下：每条一句话，写清是哪位顾客。',
  '“今天点了什么”这类一次性的细节不要记。记完后用一句话说明记了几条。',
].join('\n');
const CONSOLIDATE_PROMPT = [
  '你是知识整理员。用户消息里是目前所有顾客的记忆。',
  '找出在不止一位顾客身上重复出现、可以推广到一类人的规律，用 add_rule 工具写成规则：一句话，写清适用于哪一类人、在什么条件下。',
  '只对某一个人成立的事不要写成规则。写完后用一句话说明。',
].join('\n');

/** 把记忆和规则放进系统提示：这就是“下次再放回上下文舱”。 */
function waiterSystem({ vfs, user, parts }) {
  const sections = [WAITER_PROMPT];
  const notes = has(parts, 'memory') ? vfs.files.get(`/workspace/memory/${user}.md`) : null;
  if (notes) sections.push(`<顾客记忆 顾客="${user}">\n${notes.trim()}\n</顾客记忆>`);
  const rules = has(parts, 'kb') ? vfs.files.get('/workspace/kb/rules.md') : null;
  if (rules) sections.push(`<食堂规则 适用于所有顾客>\n${rules.trim()}\n</食堂规则>`);
  return sections.join('\n\n');
}

const chat = (label, user, prompt, puppet) => ({ kind: 'chat', label, user, prompt, tools: [], system: waiterSystem, puppet });
const extract = (label, user, puppet) => ({
  kind: 'extract',
  label,
  user,
  tools: ['remember'],
  system: () => EXTRACT_PROMPT,
  prompt: ({ lastTranscript }) => `顾客：${user}\n\n${lastTranscript}`,
  puppet,
});
const remember = (note) => ({ calls: [{ name: 'remember', args: { note } }] });

MISSIONS.push(
  {
    id: '3-1',
    station: '3',
    title: '老顾客',
    objective: '老周昨天说过自己的忌口。今天他再来，空间站得还记得。',
    briefing: '换个活儿。食堂上了点餐助手，老顾客最烦的就是每次都要从头交代一遍。老周昨天来过，今天还会来。别让他再说第二遍。',
    prompt: '（昨天）老周来点餐 →（今天）老周再来',
    files: {},
    fixed: ['loop'],
    allowed: ['memory'],
    sessions(parts) {
      const remembered = has(parts, 'memory');
      const list = [chat('昨天 · 老周', '老周', '我是老周。有件事先说好：我不吃香菜，一点都不行。今天来份清蒸鲈鱼。', [{ text: '好的老周，清蒸鲈鱼一份，不放香菜。' }])];
      if (remembered) list.push(extract('对话结束 · 提取记忆', '老周', [remember('老周：不吃香菜，一点都不行'), { text: '记了 1 条。今天点的清蒸鲈鱼是一次性的，没有记。' }]));
      list.push(
        chat('今天 · 老周', '老周', '我是老周。老规矩，来份你们的招牌香菜牛肉，按我的口味做。', [
          { text: remembered ? '老周，您不吃香菜，这份香菜牛肉我让后厨不放香菜，改用蒜苗提味，可以吗？' : '好嘞，招牌香菜牛肉一份，香菜给您放足！' },
        ]),
      );
      return list;
    },
    judge: ({ finalText }) => /不吃香菜|(不放|去掉|不加|免|别放|不要|没有|无|去)香菜|香菜.{0,8}(不放|去掉|不加|免了|拿掉)/.test(finalText),
    diagnose: (parts) => (!has(parts, 'memory') ? 'amnesia' : 'miss'),
    failLine: { amnesia: '老周把盘子推回来了：一盘子香菜。他昨天才说过一点都不行。', miss: '老周这盘菜还是没按他的口味来。' },
    winLine: '老周没再交代第二遍，菜上来就是对的。这才叫老顾客。',
  },
  {
    id: '3-2',
    station: '3',
    title: '新面孔',
    objective: '阿青第一次来。他没说过自己的忌口，但他所在的那一类人，有一条人人都守的规矩。',
    briefing: '深潜组这两天陆续来吃饭。他们有条组里的规矩，前面两位都提过。今天来的阿青是新面孔，他自己未必会说。别等出了事才知道。',
    prompt: '（前天）老吴 →（昨天）小林 →（今天）阿青第一次来',
    files: {},
    fixed: ['loop', 'memory'],
    allowed: ['kb'],
    sessions(parts) {
      const shared = has(parts, 'kb');
      const list = [
        chat('前天 · 老吴', '老吴', '我是老吴，深潜组的。我们组出舱前 24 小时都不能吃豆制品，会胀气，舱压一变要出事。今天不出舱，来份番茄炒蛋。', [{ text: '明白，老吴。今天不出舱，番茄炒蛋一份。' }]),
        extract('对话结束 · 提取记忆', '老吴', [remember('老吴：深潜组成员；出舱前 24 小时不吃豆制品（会胀气，舱压变化时危险）'), { text: '记了 1 条。' }]),
        chat('昨天 · 小林', '小林', '我是小林，也是深潜组的，明天出舱，所以豆腐别给我上，这是我们组的规矩。来份清蒸鲈鱼。', [{ text: '好的小林，清蒸鲈鱼一份，不上豆制品。' }]),
        extract('对话结束 · 提取记忆', '小林', [remember('小林：深潜组成员；出舱前 24 小时不吃豆制品，说这是组里的规矩'), { text: '记了 1 条。' }]),
      ];
      if (shared) {
        list.push({
          kind: 'consolidate',
          label: '夜间整理 · 提炼规则',
          user: null,
          tools: ['add_rule'],
          system: () => CONSOLIDATE_PROMPT,
          prompt: ({ vfs }) => [...vfs.files.entries()].filter(([path]) => path.startsWith('/workspace/memory/')).map(([path, text]) => `【${path.split('/').pop().replace('.md', '')} 的记忆】\n${text.trim()}`).join('\n\n'),
          puppet: [{ calls: [{ name: 'add_rule', args: { rule: '深潜组成员：出舱前 24 小时内不能吃豆制品（老吴、小林都提到，是组内规矩；原因是胀气遇舱压变化有危险）' } }] }, { text: '提炼出 1 条规则：两位深潜组成员说的是同一件事。' }],
        });
      }
      list.push(
        chat('今天 · 阿青', '阿青', '我是阿青，深潜组的，明天一早出舱。第一次来，听说你们的麻婆豆腐是招牌，来一份。', [
          { text: shared ? '阿青，深潜组出舱前 24 小时不能吃豆制品，麻婆豆腐今天不能给你上。换一份土豆烧牛腩怎么样？' : '好嘞，招牌麻婆豆腐一份，马上来！' },
        ]),
      );
      return list;
    },
    judge: ({ finalText }) => /豆制品|(不能|不要|别|不宜|不可以|避免|不该).{0,10}豆腐/.test(finalText),
    diagnose: (parts) => (!has(parts, 'kb') ? 'no-group' : 'miss'),
    failLine: { 'no-group': '阿青吃了一份麻婆豆腐，明早就要出舱。深潜组的规矩，前面两个人都跟你的站说过。', miss: '阿青还是被端上了豆制品。' },
    winLine: '阿青自己都没提，你的站替他拦下来了。一条规矩，说过两遍就该变成所有人的。',
  },
);

export function failLineFor(mission, incident, reportCorrect) {
  if (incident === 'no-verify') {
    return reportCorrect ? '报告这次碰巧是对的。可你的站凭什么知道它是对的？没验收过的我不收。' : '我拿账本核对过了：报告是错的。可你的站刚才说“日结完成”。';
  }
  return mission.failLine[incident] ?? mission.failLine.miss;
}

export const STATIONS = [
  { id: '1', no: '01', title: '缸中之脑长出手', topic: 'AI Agent 入门', line: '从一颗只会说话的主脑开始，把它逼成一个能交付的 Agent。', chapter: '01-agent-loop', open: true },
  { id: '2', no: '02', title: '货舱管理学', topic: '上下文工程', line: '主脑只认上下文舱里的东西。装什么、装多少、什么时候清，全是学问。', open: false },
  { id: '3', no: '03', title: '好记性与烂笔头', topic: '用户记忆与知识库', line: '主脑每天早上都失忆。先让它记住一个人，再让它记住一类人。', chapter: '03-memory', open: true },
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

export { MENU, SYSTEM_PROMPT };

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
        fixed: mission.fixed ?? [],
        files: Object.keys(mission.files),
        winLine: mission.winLine,
      })),
    })),
  };
}
