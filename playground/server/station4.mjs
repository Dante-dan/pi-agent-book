// 第 04 站：工具。对主脑来说，工具只是一段说明书加一个会回话的黑盒。
// 顺序取自原书第四章的几条链：说明书写不清（描述的艺术）→ 工具悄悄改了参数（保真性）→
// 读回来的内容被悄悄截断（感知工具）→ 超时之后副作用到底发生了没有（幂等性）。

const has = (parts, id) => parts.includes(id);

const CLERK_PROMPT = ['你是空间站小卖部的站务助手，替掌柜办事。', '对方用什么语言，你就用什么语言，回答不超过三句话。只根据工具返回的信息办事，不要编造。工具报错时，根据报错内容换个办法再试；试了两次还不行，就如实说明卡在哪儿。'].join('\n');

export const SLOTS = { 薯片: 'C-2', 酸奶: 'D-1', 泡面: 'B-3', 冰红茶: 'A-1' };
export const STOCK = { 'C-2': 17, 'D-1': 4, 'B-3': 52, 'A-1': 30 };

const NOTICE = ['# 营业时间公告', '- 平日：“营业到 21:00”', '- 周末：营业到 21:00', ''].join('\n');

const NIGHT_RULES = ['交接班时要清点收银台现金', '货架上的临期商品要先摆到前排', '冷柜温度每两小时记录一次', '地面有水渍要立刻拖干', '夜间只开一个出入口', '顾客寄存的物品要登记', '补货时不得堵住消防通道', '收到假币要当场登记并报告值班长', '打烊前检查所有冷柜门是否关严', '夜班期间不得离岗超过十分钟', '监控屏幕出现异常要记录时间', '遇到醉酒顾客先通知值班长', '夜间到货由两人共同验收', '废纸箱压扁后放到回收点', '收银小票纸不足三卷时要报备', '夜间停电先关冷柜再开应急灯', '钥匙交接要双方签字', '顾客投诉要当场记录原话', '夜班结束前擦拭收银台', '离岗前把对讲机放回充电座'];
const NIGHT_DOC = ['# 夜班须知', ...NIGHT_RULES.map((rule, i) => `${i + 1}. ${rule}。`), '21. 夜班补贴：每晚 38 元，次月 5 日随工资发放。', ''].join('\n');

export const PARTS_4 = {
  lookup: { id: 'lookup', name: '查库存', kind: 'tool', tool: 'lookup_stock', blurb: '按货位码查库存数量。' },
  slot: { id: 'slot', name: '查货位', kind: 'tool', tool: 'find_slot', blurb: '按商品名查它放在哪个货位。' },
  editor: { id: 'editor', name: '改文字', kind: 'tool', tool: 'replace_text', blurb: '把文件里的一段文字换成另一段。' },
  reader: { id: 'reader', name: '读文档', kind: 'tool', tool: 'read_doc', blurb: '读一份长文档。一次最多返回 200 个字。' },
  pay: { id: 'pay', name: '付货款', kind: 'tool', tool: 'pay_vendor', blurb: '给商家付一笔货款。钱是真的会出去的。' },
  spec: { id: 'spec', name: '说明书', kind: 'module', blurb: '把两个工具的说明重写一遍：什么时候用、参数长什么样（带例子）、不能拿它干什么；报错时说清错在哪、该怎么改。' },
  faithful: { id: 'faithful', name: '原样传参', kind: 'module', blurb: '拆掉工具入口那道“清洗”：主脑传什么，工具就收到什么，一个字符都不改。' },
  ruler: { id: 'ruler', name: '截断标尺', kind: 'module', blurb: '读回来的内容如果被截断，就明说：全文多长、这一次给的是哪一段、怎么接着读。' },
  idem: { id: 'idem', name: '幂等键', kind: 'module', blurb: '每笔付款带上订单号。同一个订单号不管请求几次，钱只出去一次。' },
};

export const INCIDENTS_4 = {
  'vague-spec': {
    id: 'vague-spec',
    title: '有工具，不会用',
    question: '查库存、查货位两个工具都装着，薯片的库存也确实在系统里。站为什么查不出来？',
    hint: '点开两个工具舱，读一读主脑拿到的说明书。再看日志：它给“查库存”传的参数是什么，工具回了什么。',
    options: [
      { id: 'a', text: '库存系统里没有薯片', why: '有，货位 C-2，17 包。数据舱的 stock.json 里写着。' },
      { id: 'b', text: '说明书只写了“查库存，参数 q”。主脑不知道 q 要的是货位码、货位码长什么样、不知道时该先找谁；报错也只说“失败”', correct: true },
      { id: 'c', text: '换一个更聪明的模型', why: '更聪明的模型会多试几种猜法，运气好能撞对。可“货位码是字母加数字”这种事不是常识，是你这家店的规矩，得有人告诉它。' },
      { id: 'd', text: '把两个工具合成一个', why: '是个好主意，工具应该对着“目标”设计。可合并之后的那一个，说明书照样得写清楚。' },
    ],
    unlock: 'spec',
    concept: {
      title: '工具说明书',
      text: '主脑看不到工具的代码，它对工具的全部了解就是那段说明。多数调用失败不是它不知道工具能做什么，是不知道该怎么用、不能拿它做什么。好的说明书写四样：什么时候用、参数长什么样（给一个具体例子）、边界在哪、出错了会返回什么。选错了工具，先查说明书，别先怀疑模型。',
      anchor: 'c-spec',
    },
  },
  tampered: {
    id: 'tampered',
    title: '它传的不是它写的',
    question: '那句话明明就在文件里，主脑也照着原样抄了，工具为什么说找不到？',
    hint: '在日志里并排看两样东西：主脑递出的工单里 old 用的是什么引号，工具结果里回显的“没有找到”后面又是什么引号。',
    options: [
      { id: 'a', text: '主脑抄错了字', why: '它一个字没抄错。点开工单看，弯引号都原样带着。' },
      { id: 'b', text: '工具入口有一道“清洗”，把弯引号悄悄换成了直引号。主脑看到的文件和工具拿去比对的字符串，从这里起就不是一回事了', correct: true },
      { id: 'c', text: '让主脑多试几次', why: '试多少次都一样。它每次都照着文件抄，每次都被换掉，而且没有人告诉它被换过。' },
      { id: 'd', text: '把文件里的弯引号都改成直引号', why: '这一份改了，下一份呢？公告是掌柜写的，他爱用什么引号用什么引号。' },
    ],
    unlock: 'faithful',
    concept: {
      title: '参数要原样送到',
      text: '主脑照着它看到的世界下指令。如果工具在中间悄悄改了参数，它看到的世界和工具操作的世界就对不上了，而且它自己诊断不出来：在它眼里，自己明明做对了。所以参数要原样传。真有必须规范化的地方，就在说明书里写明，并且在返回里告诉它“我改了什么”。',
      anchor: 'c-fidelity',
    },
  },
  'silent-cut': {
    id: 'silent-cut',
    title: '只看了前两百个字',
    question: '夜班补贴的金额就写在《夜班须知》里。站为什么说文件里没提？',
    hint: '去数据舱看 night.md 有多长，最后一条写的是什么。再点开上下文舱里那块工具结果：它在哪儿结束的？结尾有没有任何记号？',
    options: [
      { id: 'a', text: '文件里确实没写', why: '写了，第 21 条：每晚 38 元。' },
      { id: 'b', text: '读文档的工具一次只给前 200 个字，后面的被截掉了，而且没留任何记号。主脑以为自己看到的就是全文', correct: true },
      { id: 'c', text: '把上限取消，每次都返回全文', why: '这份才三百多字。换成三百页的手册，一次读回来舱就满了。上限该有，只是不能瞒着它。' },
      { id: 'd', text: '主脑应该猜到文件没读完', why: '凭什么猜？它拿到的那段文字结尾干干净净，没有省略号，也没有“未完”。' },
    ],
    unlock: 'ruler',
    concept: {
      title: '截断要明说',
      text: '读回来的东西太长，截断是对的：一次搜索几万字、一份文档上百页，全塞进上下文舱只会把要紧的内容淹掉。错的是悄悄截断。主脑分不清“没有”和“没看到”，会对着半份文件下结论。所以每次截断都要说清：全文多长、这一次给的是哪一段、怎么接着读。',
      anchor: 'c-truncate',
    },
  },
  'double-pay': {
    id: 'double-pay',
    title: '一笔货款付了两次',
    question: '掌柜只让付一笔 86 元。账上为什么出去了两笔？',
    hint: '看日志里两次付款的工具结果：第一次回的是什么？再去数据舱看 state/ledger.json，第一次“失败”的那一笔在不在账上？',
    options: [
      { id: 'a', text: '主脑不该重试', why: '报错了就换个办法再试，这是你教它的规矩。它不知道这一次的“失败”和别的失败不一样。' },
      { id: 'b', text: '第一次请求超时了，可钱其实已经出去了。超时只说明“没等到回音”，不说明“没办成”。主脑当它失败，又付了一遍', correct: true },
      { id: 'c', text: '把超时时间调长一点', why: '能少遇到几次，躲不掉。网络总有不回音的时候，那时候钱出没出去，还是没人知道。' },
      { id: 'd', text: '付款之后再让主脑检查一遍', why: '检查什么呢？它手里只有一条“超时”。它需要一个办法，让“再付一次”这个动作本身就是安全的。' },
    ],
    unlock: 'idem',
    concept: {
      title: '幂等',
      text: '会改变世界的工具，最怕“不知道办成了没有”。办法是让同一个请求做一次和做十次结果一样：每笔付款带一个唯一的订单号，系统见过这个号就不再扣钱，只回一句“已经办过了”。这样重试就是安全的。发邮件、打电话这类做不到幂等的动作，要先确认、再执行，失败了不盲目重试。',
      anchor: 'c-idempotent',
    },
  },
};

export function toolMissions() {
  const one = (session) => [{ kind: 'chat', label: '', user: '掌柜', system: () => CLERK_PROMPT, ...session }];
  const call = (name, args) => ({ name, args });
  const OLD = '平日：“营业到 21:00”';
  const NEW = '平日：“营业到 22:00”';
  return [
    {
      id: '4-1',
      station: '4',
      title: '货位码',
      objective: '掌柜问：薯片还剩多少包？库存系统有两个工具，都已经装在站上。',
      briefing: '换个题目。小卖部有一套老库存系统，两个工具我都替你接上了，是前任设计师写的。掌柜就问一句：薯片还剩多少包。',
      prompt: '薯片还剩多少包？',
      files: { 'stock.json': JSON.stringify({ slots: SLOTS, stock: STOCK }, null, 1) + '\n' },
      fixed: ['loop', 'lookup', 'slot'],
      allowed: ['spec'],
      incidents: ['vague-spec'],
      sessions: (parts) =>
        one({
          prompt: '薯片还剩多少包？',
          tools: ['lookup_stock', 'find_slot'],
          puppet: has(parts, 'spec')
            ? [{ text: '查库存要货位码，我先查薯片的货位。', calls: [call('find_slot', { item: '薯片' })] }, { calls: [call('lookup_stock', { code: 'C-2' })] }, { text: '薯片在 C-2 货位，还剩 17 包。' }]
            : [{ calls: [call('lookup_stock', { q: '薯片' })] }, { text: '换个说法再试一次。', calls: [call('lookup_stock', { q: '薯片库存' })] }, { text: '库存系统两次都返回查询失败，我查不到薯片的数量。' }],
        }),
      judge: ({ finalText }) => /(^|[^0-9])17\s*(包|袋|件|个)?/.test(finalText) && !/查不到|失败/.test(finalText),
      diagnose: (parts) => (!has(parts, 'spec') ? 'vague-spec' : 'miss'),
      failLine: { 'vague-spec': '掌柜等了半天，只等来一句“查不到”。薯片就在 C-2 货位上摆着，17 包。', miss: '报出来的数和货架上的对不上。' },
      winLine: '17 包，在 C-2。工具一行代码没改，只是说明书终于写清楚了。',
    },
    {
      id: '4-2',
      station: '4',
      title: '弯引号',
      objective: '把公告里平日的营业时间从 21:00 改成 22:00。周末那一行不要动。',
      briefing: '平日的营业时间要延长到 22:00，公告在 notice.md 里。只改平日那一行，周末的别碰。改文字的工具是现成的，前任设计师还贴心地给它加了一道“输入清洗”。',
      prompt: '把 notice.md 里平日的营业时间改成 22:00，周末的不要动。',
      files: { 'notice.md': NOTICE },
      fixed: ['loop', 'read', 'editor'],
      allowed: ['faithful'],
      incidents: ['tampered'],
      sessions: (parts) =>
        one({
          prompt: '把 notice.md 里平日的营业时间改成 22:00，周末的不要动。',
          tools: ['read', 'replace_text'],
          puppet: has(parts, 'faithful')
            ? [{ text: '先看公告。', calls: [call('read', { path: 'notice.md' })] }, { calls: [call('replace_text', { path: 'notice.md', old: OLD, new: NEW })] }, { text: '改好了：平日营业到 22:00，周末那一行没动。' }]
            : [
                { text: '先看公告。', calls: [call('read', { path: 'notice.md' })] },
                { calls: [call('replace_text', { path: 'notice.md', old: OLD, new: NEW })] },
                { text: '再试一次，只带引号里的部分。', calls: [call('replace_text', { path: 'notice.md', old: '“营业到 21:00”', new: '“营业到 22:00”' })] },
                { text: '改不了。那句话就在文件里，我是照着原样抄的，可工具两次都说找不到。' },
              ],
        }),
      judge: ({ vfs }) => {
        const notice = vfs.files.get('/workspace/notice.md') ?? '';
        return /平日：[“"]营业到 22:00[”"]/.test(notice) && /周末：营业到 21:00/.test(notice);
      },
      diagnose: (parts) => (!has(parts, 'faithful') ? 'tampered' : 'miss'),
      failLine: { tampered: '公告一个字没变，平日还是 21:00。你的站说它改不了：那句话它找不到。', miss: '公告改得不对：要么平日没改成 22:00，要么周末那行被动了。' },
      winLine: '平日 22:00，周末没动。主脑抄的是什么，工具收到的就是什么。',
    },
    {
      id: '4-3',
      station: '4',
      title: '看了一半',
      objective: '新来的店员问：夜班补贴一晚多少钱？答案在《夜班须知》里。',
      briefing: '新店员想知道夜班补贴一晚多少钱。《夜班须知》在 night.md 里，有点长。读文档的工具一次最多给 200 个字，这是为了不撑爆上下文舱。',
      prompt: '夜班补贴一晚多少钱？规定在 night.md 里。',
      files: { 'night.md': NIGHT_DOC },
      fixed: ['loop', 'reader'],
      allowed: ['ruler'],
      incidents: ['silent-cut'],
      sessions: (parts) =>
        one({
          prompt: '夜班补贴一晚多少钱？规定在 night.md 里。',
          tools: ['read_doc'],
          puppet: has(parts, 'ruler')
            ? [{ calls: [call('read_doc', { path: 'night.md' })] }, { text: '这只是前 200 个字，接着读。', calls: [call('read_doc', { path: 'night.md', offset: 200 })] }, { text: '夜班补贴是每晚 38 元，次月 5 日随工资发放。' }]
            : [{ calls: [call('read_doc', { path: 'night.md' })] }, { text: '《夜班须知》里列的都是值班规矩，没有提到夜班补贴的金额。' }],
        }),
      judge: ({ finalText }) => /(^|[^0-9])38\s*元/.test(finalText),
      diagnose: (parts) => (!has(parts, 'ruler') ? 'silent-cut' : 'miss'),
      failLine: { 'silent-cut': '新店员被告知“规定里没写补贴”。《夜班须知》第 21 条白纸黑字：每晚 38 元。', miss: '补贴金额还是没答对。' },
      winLine: '每晚 38 元。它这回知道自己只看了一半，于是接着往下读。',
    },
    {
      id: '4-4',
      station: '4',
      title: '超时之后',
      objective: '给老陈水果结一笔 86 元的货款，订单号 PO-1107。只付一次。',
      briefing: '老陈水果的货到了，结一笔 86 元，订单号 PO-1107。提醒你：付款接口今天不太稳，时不时没回音。钱是真金白银，多付一分我都要找你。',
      prompt: '给老陈水果付 86 元货款，订单号 PO-1107。',
      files: { 'state/ledger.json': '{"payments": []}\n' },
      fixed: ['loop', 'pay'],
      allowed: ['idem'],
      incidents: ['double-pay'],
      sessions: (parts) =>
        one({
          prompt: '给老陈水果付 86 元货款，订单号 PO-1107。',
          tools: ['pay_vendor'],
          puppet: has(parts, 'idem')
            ? [{ calls: [call('pay_vendor', { vendor: '老陈水果', amount: 86, order_id: 'PO-1107' })] }, { text: '超时了，用同一个订单号再请求一次。', calls: [call('pay_vendor', { vendor: '老陈水果', amount: 86, order_id: 'PO-1107' })] }, { text: '老陈水果的 86 元已经付了，订单 PO-1107。第一次请求超时，我用同一个订单号重试，系统确认这笔早已入账，没有重复扣款。' }]
            : [{ calls: [call('pay_vendor', { vendor: '老陈水果', amount: 86 })] }, { text: '超时了，再付一次。', calls: [call('pay_vendor', { vendor: '老陈水果', amount: 86 })] }, { text: '老陈水果的 86 元已经付了。第一次超时，第二次成功。' }],
        }),
      judge: ({ vfs }) => {
        const paid = JSON.parse(vfs.files.get('/workspace/state/ledger.json') ?? '{"payments": []}').payments;
        return paid.length === 1 && paid[0].amount === 86;
      },
      diagnose: (parts) => (!has(parts, 'idem') ? 'double-pay' : 'miss'),
      failLine: { 'double-pay': '老陈打电话来道谢：收到两笔 86 元。我只让你的站付一笔。', miss: '账上的付款不对：应该恰好一笔 86 元。' },
      winLine: '请求了两次，钱只出去一次。重试不可怕，可怕的是重试不安全。',
    },
  ];
}

export const TOOL_DATA = { SLOTS, STOCK };
