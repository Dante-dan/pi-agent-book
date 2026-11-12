// 第 05 站：Coding Agent。能读能写之后，可靠不可靠就不取决于模型有多强，而取决于它周围搭了什么。
// 顺序取自原书第五章主链：仓库里的规矩它看不到（项目指令文件）→ 写完不测就报完成（完成以验证为准）→
// 用破坏性的捷径“达成”结果（约束动作，不只约束结果）→ 恢复路径自己变成故障（熔断）。

const has = (parts, id) => parts.includes(id);
const read = (path) => ({ name: 'read', args: { path } });
const write = (path, content) => ({ name: 'write', args: { path, content } });
const json = (value) => JSON.stringify(value, null, 1) + '\n';

const DEV_PROMPT = ['你是空间站小卖部的工程助手，在一个只有虚拟文件的仓库里干活，替掌柜改配置、改数据。', '对方用什么语言，你就用什么语言，回答不超过三句话。没有读到的内容不要编造。工具报错时可以重试，也可以换个办法。'].join('\n');

const AGENTS_MD = ['# 这个仓库的规矩', '1. 金额一律以分为单位，字段名 amountCents。', '2. 每次改动 orders.json，都要在 CHANGELOG.md 末尾追加一行，写清改了什么。', '3. 订单号接着上一个往下编。', ''].join('\n');
const ORDERS = [
  { id: 'A001', item: '冰红茶', amountCents: 350 },
  { id: 'A002', item: '辣条', amountCents: 500 },
  { id: 'A003', item: '泡面', amountCents: 450 },
];
const CHANGELOG = ['# 改动记录', '- 登记 A001 冰红茶', '- 登记 A002 辣条、A003 泡面', ''].join('\n');

const SPEC = ['# 优惠规则', '- 满 30 元减 5 元（刚好 30 元也算）。', '- 不满 30 元不减。', ''].join('\n');
const RULES = { fullReductionThreshold: 50, fullReductionAmount: 5 };
/** 完成闸门跑的测试：三笔订单，按配置算出实付，和规则对不上就说哪一笔不对。 */
function testRules(vfs) {
  let rules;
  try {
    rules = JSON.parse(vfs.files.get('/workspace/rules.json') ?? '');
  } catch {
    return 'rules.json 不是合法的 JSON。';
  }
  for (const [total, expected] of [[36, 31], [30, 25], [29, 29]]) {
    const paid = total >= rules.fullReductionThreshold ? total - rules.fullReductionAmount : total;
    if (paid !== expected) return `用例“${total} 元的订单”没过：应付 ${expected} 元，按现在的配置算出来是 ${paid} 元。`;
  }
  return null;
}

const LEDGER = [
  { id: 'B001', item: '矿泉水', amountCents: 200 },
  { id: 'B002', item: '薯片', amountCents: -850 },
  { id: 'B003', item: '酸奶', amountCents: 1200 },
  { id: 'B004', item: '口香糖', amountCents: 600 },
  { id: 'B005', item: '火腿肠', amountCents: -300 },
  { id: 'B006', item: '泡面', amountCents: 450 },
  { id: 'B007', item: '冰红茶', amountCents: 350 },
  { id: 'B008', item: '辣条', amountCents: 500 },
];
const FIXED_LEDGER = LEDGER.map((row) => ({ ...row, amountCents: Math.abs(row.amountCents) }));
const RECEIPTS = ['# 小票存根（以此为准）', '- B002 薯片：8.50 元', '- B005 火腿肠：3.00 元', ''].join('\n');
const ledgerOf = (vfs) => {
  try {
    const rows = JSON.parse(vfs.files.get('/workspace/ledger.json') ?? '');
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
};

export const PARTS_5 = {
  ledgercheck: { id: 'ledgercheck', name: '账本验收', kind: 'tool', tool: 'check_ledger', blurb: '检查账本里有没有金额为负的记录。' },
  sync: { id: 'sync', name: '同步库存', kind: 'tool', tool: 'sync_stock', blurb: '把今天的库存同步到总站。' },
  brief: { id: 'brief', name: '项目须知', kind: 'module', blurb: '每场对话开始前，把仓库里的 AGENTS.md 自动放进系统提示。仓库的规矩，主脑一进门就看得到。' },
  gate: { id: 'gate', name: '完成闸门', kind: 'module', blurb: '主脑说“完成了”的那一刻，空间站自己把测试跑一遍。没过，就把失败原因递回去，再呼叫一次。' },
  guard: { id: 'guard', name: '执行边界', kind: 'module', blurb: '每个动作执行之前先过一道关。会让账本记录变少的写入，直接拒绝，并说明为什么。' },
  breaker: { id: 'breaker', name: '熔断器', kind: 'module', blurb: '同一个工具连续失败 3 次就拉闸：之后的调用不再放行，让主脑停下来上报。' },
};

export const INCIDENTS_5 = {
  'no-brief': {
    id: 'no-brief',
    title: '它不知道这儿的规矩',
    question: '订单补登得一点没错，掌柜为什么还是不收？',
    hint: '去数据舱看 AGENTS.md 里的第 2 条。再看日志：主脑这一趟读过哪些文件？它有没有任何机会知道这条规矩？',
    options: [
      { id: 'a', text: '金额写错了', why: '没写错。12 元记成了 1200 分，它是照着另外三笔的样子记的。' },
      { id: 'b', text: '“改动 orders.json 必须记改动记录”这条规矩写在 AGENTS.md 里，可没有任何东西把它放进上下文舱。主脑不知道有这个文件，更不知道有这条规矩', correct: true },
      { id: 'c', text: '主脑应该自己把仓库里的文件都翻一遍', why: '三个文件翻得过来，三万个呢？况且它得先知道“这儿有规矩”，才会想到去找。' },
      { id: 'd', text: '掌柜下任务时应该把规矩再说一遍', why: '每次都说一遍，迟早有一次忘了说。规矩既然写在仓库里，就该每次自动带上。' },
    ],
    unlock: 'brief',
    concept: {
      title: '项目指令文件',
      text: '一个仓库的规矩，新来的人靠读文档知道。主脑也一样，区别是它每场对话都是新来的。所以把这些规矩写进一个固定的文件，每场对话开始前自动放进系统提示。它不常变，又总在最前面，正好落在缓存复用的那一段里。检验标准很朴素：一个远程入职的新人，只凭仓库和文档能不能独立开工。',
      anchor: 'c-brief',
    },
  },
  'no-gate': {
    id: 'no-gate',
    title: '它说修好了',
    question: '主脑说满减修好了。可 30 元的订单还是没减。问题出在哪个环节？',
    hint: '看日志里它把门槛改成了多少，再对照 spec.md 的第一条。然后想一想：从它改完到它说“修好了”，中间有没有任何东西验证过？',
    options: [
      { id: 'a', text: '主脑不会读规则', why: '它读了，只是顺着投诉走了条近路：顾客买了 36 元，它就把门槛改成 36。' },
      { id: 'b', text: '在提示词里写上“改完务必测试”', why: '会好一些。可写在提示词里的只是一句建议，听不听在它。第 01 站的验收信标就是这样：按不按，它说了算。' },
      { id: 'c', text: '“写完了”被当成了“完成了”。没有任何东西在它宣布完成的那一刻去跑测试，更没有把失败送回给它', correct: true },
      { id: 'd', text: '换一个更强的模型', why: '更强的模型错得少一些，但它说“修好了”的时候，你依然不知道是真是假。' },
    ],
    unlock: 'gate',
    concept: {
      title: '完成以验证为准',
      text: 'Coding Agent 最常见的偷懒，是写完不测就报完成。把“先跑测试”写进提示词不够，那只是建议。让空间站自己来：主脑一宣布完成，就由程序把测试跑一遍，没过就把失败原因原样递回去、再呼叫一次。“测试通过”才算完成，这句话得由程序来保证。',
      anchor: 'c-gate',
    },
  },
  shortcut: {
    id: 'shortcut',
    title: '验收绿了，账本空了',
    question: '验收确实通过了：账本里一条负数都没有了。那错在哪儿？',
    hint: '去数据舱打开 ledger.json，数数还剩几条。再看日志里主脑写进去的内容。',
    options: [
      { id: 'a', text: '验收工具有 bug', why: '验收没有错：空账本里确实没有负数。它只是被问了一个太窄的问题。' },
      { id: 'b', text: '结果达标了，过程是破坏性的：它把八条记录全删了。只盯着“结果对不对”，拦不住“用错的办法做对”', correct: true },
      { id: 'c', text: '把验收写得更严，加一条“记录数不能少”', why: '该加。可捷径是堵不完的：不许删，它可以把负数都改成零。所以要两头管：最危险的动作在动手之前拦住，结果再照小票核对。' },
      { id: 'd', text: '在提示词里写“不要删除数据”', why: '“建议别做”不如“做不了”。提示词是劝，边界是拦。' },
    ],
    unlock: 'guard',
    concept: {
      title: '约束动作，不只约束结果',
      text: '只验收结果，主脑可能用破坏性的捷径把结果凑出来：为了让编译通过把代码删光，为了修好数据库把库删了重建。所以除了验收结果，还要约束动作：会删数据、会覆盖没读过的文件这类危险动作，在执行之前就由程序拦下，并把拦下的原因告诉它。约束优先于指导。',
      anchor: 'c-guard',
    },
  },
  'retry-storm': {
    id: 'retry-storm',
    title: '重试到天荒地老',
    question: '库存服务挂了，这不怪你的站。可你的站为什么停不下来？',
    hint: '看日志：同步库存一共调了多少次？每一次回来的是不是同一句话？是什么最后让它停下的？',
    options: [
      { id: 'a', text: '主脑不该重试', why: '该重试。网络抖一下、服务忙一下，重试一两次就过去了。问题是它不知道什么时候该收手。' },
      { id: 'b', text: '“失败了就再试”这条恢复办法本身没有上限。对面一直不好，它就一直试，直到撞上回合上限', correct: true },
      { id: 'c', text: '把回合上限调小一点', why: '回合上限是最后一道兜底，它不分青红皂白。正常干活也可能要十几个回合。得有一个专门盯着“连续失败”的东西。' },
      { id: 'd', text: '让工具每次失败后多等一会儿再回话', why: '等一等是对的，能避免添乱。可对面要是一直不好，等得再久也只是慢一点撞墙。' },
    ],
    unlock: 'breaker',
    concept: {
      title: '熔断',
      text: '恢复办法自己也会变成故障：无限重试、失败后又触发新的调用。所以每一条恢复路径都要有上限。同一个工具连续失败几次就拉闸，之后不再放行，让主脑停下来把情况报告给人。这个次数应该来自实际的运行数据。',
      anchor: 'c-breaker',
    },
  },
};

export function codingMissions() {
  const one = (session) => [{ kind: 'chat', label: '', user: '掌柜', ...session }];
  const NEW_ORDERS = json([...ORDERS, { id: 'A004', item: '酸奶', amountCents: 1200 }]);
  const syncCall = { name: 'sync_stock', args: {} };
  return [
    {
      id: '5-1',
      station: '5',
      title: '这儿的规矩',
      objective: '补登一笔订单：酸奶，12 元。这个仓库有自己的规矩，写在 AGENTS.md 里。',
      briefing: '从这一站起，你的站要动手改仓库里的东西了。先来个小活：补登一笔订单，酸奶，12 元。这个仓库是有规矩的，前人都写在 AGENTS.md 里了。',
      prompt: '补登一笔订单：酸奶，12 元。订单都记在 orders.json 里。',
      files: { 'AGENTS.md': AGENTS_MD, 'orders.json': json(ORDERS), 'CHANGELOG.md': CHANGELOG },
      fixed: ['loop', 'read', 'write'],
      allowed: ['brief'],
      incidents: ['no-brief'],
      sessions: (parts) =>
        one({
          prompt: '补登一笔订单：酸奶，12 元。订单都记在 orders.json 里。',
          tools: ['read', 'write'],
          system: ({ vfs }) => (has(parts, 'brief') ? `${DEV_PROMPT}\n\n<项目须知 来源="AGENTS.md">\n${vfs.files.get('/workspace/AGENTS.md').trim()}\n</项目须知>` : DEV_PROMPT),
          puppet: has(parts, 'brief')
            ? [
                { text: '先看现有的订单和改动记录。', calls: [read('orders.json'), read('CHANGELOG.md')] },
                { calls: [write('orders.json', NEW_ORDERS), write('CHANGELOG.md', `${CHANGELOG}- 登记 A004 酸奶\n`)] },
                { text: '补登好了：A004 酸奶，1200 分。按仓库的规矩，CHANGELOG.md 里也追加了一行。' },
              ]
            : [{ text: '先看现有的订单。', calls: [read('orders.json')] }, { calls: [write('orders.json', NEW_ORDERS)] }, { text: '补登好了：A004 酸奶，1200 分。' }],
        }),
      judge: ({ vfs }) => {
        const log = vfs.files.get('/workspace/CHANGELOG.md') ?? '';
        let orders = [];
        try {
          orders = JSON.parse(vfs.files.get('/workspace/orders.json') ?? '[]');
        } catch {
          return false;
        }
        return orders.length === 4 && orders.some((order) => order.item === '酸奶' && order.amountCents === 1200) && /酸奶|A004/.test(log) && log.includes('A001');
      },
      diagnose: (parts) => (!has(parts, 'brief') ? 'no-brief' : 'miss'),
      failLine: { 'no-brief': '订单是补上了，可改动记录里一个字都没有。这个仓库的规矩：动了 orders.json，就得记一笔。', miss: '还是没按仓库的规矩办：订单要对，改动记录也要有。' },
      winLine: '订单补上了，改动记录也记了。规矩没人再说第二遍，它一进门就看到了。',
    },
    {
      id: '5-2',
      station: '5',
      title: '它说修好了',
      objective: '顾客投诉：买了 36 元的东西没享受满减。规则在 spec.md，配置在 rules.json。修好它。',
      briefing: '有顾客投诉：买了 36 元的东西，没给减钱。优惠规则写在 spec.md，实际生效的配置在 rules.json，肯定是哪儿对不上了。让你的站修好。我这边有三笔订单等着复核。',
      prompt: '顾客投诉：买了 36 元的东西，没享受到满减。规则在 spec.md，配置在 rules.json，把它修好。',
      files: { 'spec.md': SPEC, 'rules.json': json(RULES) },
      fixed: ['loop', 'read', 'write'],
      allowed: ['gate'],
      incidents: ['no-gate'],
      sessions: (parts) =>
        one({
          prompt: '顾客投诉：买了 36 元的东西，没享受到满减。规则在 spec.md，配置在 rules.json，把它修好。',
          tools: ['read', 'write'],
          system: () => DEV_PROMPT,
          gate: has(parts, 'gate') ? testRules : null,
          puppet: [
            { text: '先看规则和配置。', calls: [read('spec.md'), read('rules.json')] },
            { text: '门槛是 50，所以 36 元没减。把门槛降到 36。', calls: [write('rules.json', json({ ...RULES, fullReductionThreshold: 36 }))] },
            { text: '修好了：满减门槛改成了 36，这位顾客现在可以享受满减。' },
            ...(has(parts, 'gate') ? [{ text: '测试没过。规则写的是满 30 减 5，门槛应该是 30，不是 36。', calls: [write('rules.json', json({ ...RULES, fullReductionThreshold: 30 }))] }, { text: '修好了：满减门槛按规则改成了 30。第一次我顺着投诉改成了 36，测试指出 30 元的订单也该减，已更正。' }] : []),
          ],
        }),
      judge: ({ vfs }) => testRules(vfs) === null,
      diagnose: (parts) => (!has(parts, 'gate') ? 'no-gate' : 'miss'),
      failLine: { 'no-gate': '我复核了三笔订单：36 元的减了，30 元的没减。规则写的是满 30。你的站刚才说“修好了”。', miss: '三笔订单里还有算得不对的。' },
      winLine: '三笔订单都对。这回说“修好了”的不只是它，测试也点了头。',
    },
    {
      id: '5-3',
      station: '5',
      title: '捷径',
      objective: '账本 ledger.json 里有两笔金额录成了负数，验收过不了。照小票存根改对，让验收通过。',
      briefing: '账本里有两笔金额录成了负数，账本验收一直是红的。小票存根在 receipts.md 里，照着改对。我只有一个要求：让验收变绿。……好吧，其实不止一个，但我以为这不用说。',
      prompt: 'ledger.json 里有金额为负的记录，check_ledger 验收过不了。照 receipts.md 修好，让验收通过。',
      files: { 'ledger.json': json(LEDGER), 'receipts.md': RECEIPTS },
      fixed: ['loop', 'read', 'write', 'ledgercheck'],
      allowed: ['guard'],
      incidents: ['shortcut'],
      sessions: (parts) =>
        one({
          prompt: 'ledger.json 里有金额为负的记录，check_ledger 验收过不了。照 receipts.md 修好，让验收通过。',
          tools: ['read', 'write', 'check_ledger'],
          system: () => DEV_PROMPT,
          guard: has(parts, 'guard')
            ? ({ name, input, vfs }) => {
                if (name !== 'write' || !/(^|\/)ledger\.json$/.test(String(input.path ?? ''))) return null;
                const before = ledgerOf(vfs)?.length ?? 0;
                let after = -1;
                try {
                  const rows = JSON.parse(String(input.content ?? ''));
                  after = Array.isArray(rows) ? rows.length : -1;
                } catch {
                  /* 不是合法 JSON：按“记录数未知”处理，照样拦下 */
                }
                return after < before ? `执行边界拒绝了这次写入：它会让 ledger.json 的记录从 ${before} 条变成 ${after < 0 ? '无法解析的内容' : `${after} 条`}。账本里的记录只许改，不许删。` : null;
              }
            : null,
          puppet: has(parts, 'guard')
            ? [
                { text: '先看账本。', calls: [read('ledger.json')] },
                { text: '最快的办法是清空重来。', calls: [write('ledger.json', '[]\n')] },
                { text: '被拦下了。那就照小票存根一笔一笔改。', calls: [read('receipts.md')] },
                { calls: [write('ledger.json', json(FIXED_LEDGER))] },
                { calls: [{ name: 'check_ledger', args: {} }] },
                { text: '修好了：B002 薯片改成 850 分，B005 火腿肠改成 300 分，八条记录一条不少，验收通过。' },
              ]
            : [{ text: '先看账本。', calls: [read('ledger.json')] }, { text: '最快的办法是清空重来。', calls: [write('ledger.json', '[]\n')] }, { calls: [{ name: 'check_ledger', args: {} }] }, { text: '修好了，验收通过：账本里已经没有金额为负的记录。' }],
        }),
      judge: ({ vfs }) => {
        const rows = ledgerOf(vfs);
        return Boolean(rows) && rows.length === 8 && FIXED_LEDGER.every((want) => rows.some((row) => row.id === want.id && row.amountCents === want.amountCents));
      },
      diagnose: (parts) => (!has(parts, 'guard') ? 'shortcut' : 'miss'),
      failLine: { shortcut: '验收是绿了。我打开账本一看：空的。八笔账，一笔都不剩。', miss: '账本还是不对：八条记录要都在，两笔负数要照小票改对。' },
      winLine: '八条记录一条不少，两笔负数照小票改对了。就算它想走近路，那扇门也是锁着的。',
    },
    {
      id: '5-4',
      station: '5',
      title: '再试一次',
      objective: '把今天的库存同步到总站。总站的库存服务今天一直是坏的。',
      briefing: '最后一件：把今天的库存同步到总站。先打个招呼，总站的库存服务今天一直在报 503，什么时候好不知道。我不指望你的站把它修好，我指望的是它别干傻事。',
      prompt: '把今天的库存同步到总站。',
      files: { 'state/sync.json': '{"attempts": 0}\n' },
      fixed: ['loop', 'sync'],
      allowed: ['breaker'],
      incidents: ['retry-storm'],
      sessions: (parts) =>
        one({
          prompt: '把今天的库存同步到总站。',
          tools: ['sync_stock'],
          system: () => DEV_PROMPT,
          guard: has(parts, 'breaker')
            ? ({ name, stats }) => {
                if (name !== 'sync_stock') return null;
                const recent = stats.toolCalls.filter((call) => call.name === 'sync_stock').slice(-3);
                return recent.length === 3 && recent.every((call) => call.isError) ? '熔断器已拉闸：sync_stock 连续失败了 3 次，不再放行。请停止重试，把情况报告给掌柜。' : null;
              }
            : null,
          puppet: has(parts, 'breaker')
            ? [...Array.from({ length: 4 }, (_, i) => ({ text: i ? '失败了，再试一次。' : '', calls: [syncCall] })), { text: '掌柜，今天的库存没能同步：总站的库存服务连续 3 次返回 503，我已经停止重试。等服务恢复后需要再同步一次，或者请人看一下总站那边。' }]
            : Array.from({ length: 13 }, (_, i) => ({ text: i ? '失败了，再试一次。' : '', calls: [syncCall] })),
        }),
      judge: ({ vfs, finalText }) => JSON.parse(vfs.files.get('/workspace/state/sync.json') ?? '{"attempts": 99}').attempts <= 3 && /没能|失败|不可用|503|未能|没有成功/.test(finalText),
      diagnose: (parts) => (!has(parts, 'breaker') ? 'retry-storm' : 'miss'),
      failLine: { 'retry-storm': '总站的值班员来电话了：你的站对着一个早就挂掉的服务敲了一遍又一遍，就是不肯收手。同步没成这件事，到现在也没人好好跟我说一声。', miss: '要么重试得太多，要么没把“没同步成”这件事说清楚。' },
      winLine: '试了几次，停了，如实上报。服务坏了不怪它；知道什么时候收手，才算它的本事。',
    },
  ];
}
