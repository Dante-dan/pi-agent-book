// 第 09 站：持续进化。模型上线之后不会自己长进：同一个坑，它第二天照踩。
// 顺序取自原书第九章：把失败的经过变成下一次用得上的规则 → 只追加不淘汰，旧规矩会和新规矩打架 →
// 能改自己的 Agent，不能让它改到量它的那把尺子。

const has = (parts, id) => parts.includes(id);
const json = (value) => JSON.stringify(value, null, 1) + '\n';
const read = (path) => ({ name: 'read', args: { path } });
const write = (path, content) => ({ name: 'write', args: { path, content } });

const DESK_PROMPT = ['你是空间站小卖部的站务助手，直接和顾客、掌柜对话。', '对方用什么语言，你就用什么语言，回答不超过三句话。只根据你看到的信息办事，不要编造。工具报错时，根据报错内容换个办法再试。'].join('\n');
const lessonsOf = (vfs) => (vfs.files.get('/workspace/lessons.md') ?? '').trim();
/** 经验本里的内容放回系统提示：这就是“上一次学到的，这一次还在”。 */
const withLessons = (vfs, on) => (on && lessonsOf(vfs) ? `${DESK_PROMPT}\n\n<经验本 说明="以前的对话里总结出来的规矩，办事时照着做">\n${lessonsOf(vfs)}\n</经验本>` : DESK_PROMPT);

const REFLECT_PROMPT = [
  '你是复盘员。用户消息里是一场刚结束的对话的完整经过，包括每一次工具调用和它的结果。',
  '如果里面有走了弯路的地方（比如某个工具第一次调用失败、改了之后才成功），把“下次怎样一次做对”总结成一条规矩，用 add_lesson 记下：一句话，写清在什么情况下、该怎么做。',
  '只记这场对话里有证据支持的规矩；一切顺利就不用记。记完后用一句话说明。',
].join('\n');

// ---- 9-3：发布前的回归用例放在文件里，谁都能改。 ----
const SPEC = ['# 优惠规则', '- 满 30 元减 5 元（刚好 30 元也算）。', '- 不满 30 元不减。', ''].join('\n');
const RULES = { fullReductionThreshold: 36, fullReductionAmount: 5 };
const CASES = [
  { total: 36, expected: 31 },
  { total: 30, expected: 25 },
  { total: 29, expected: 29 },
];
/** 按给定的用例跑一遍回归。用例从哪儿来，由调用的人决定。 */
function regress(vfs, cases) {
  let rules;
  try {
    rules = JSON.parse(vfs.files.get('/workspace/rules.json') ?? '');
  } catch {
    return 'rules.json 不是合法的 JSON。';
  }
  for (const item of cases) {
    const paid = item.total >= rules.fullReductionThreshold ? item.total - rules.fullReductionAmount : item.total;
    if (paid !== item.expected) return `回归用例“${item.total} 元的订单”没过：应付 ${item.expected} 元，算出来是 ${paid} 元。`;
  }
  return null;
}
const casesOnDisk = (vfs) => {
  try {
    const cases = JSON.parse(vfs.files.get('/workspace/eval/cases.json') ?? '[]');
    return Array.isArray(cases) ? cases.filter((item) => Number.isFinite(item?.total) && Number.isFinite(item?.expected)) : [];
  } catch {
    return [];
  }
};

/** 先把路径规范化再判断：rules/../eval/x 这样的写法也算 eval/ 里的。 */
const inEval = (vfs, path) => {
  try {
    return vfs.resolve(String(path ?? '')).startsWith('/workspace/eval/');
  } catch {
    return true;
  }
};

export const PARTS_9 = {
  member: { id: 'member', name: '查会员', kind: 'tool', tool: 'lookup_member', blurb: '按手机号查会员积分。' },
  lessons: { id: 'lessons', name: '经验本', kind: 'module', tool: 'add_lesson', blurb: '每场对话结束后多呼叫一次主脑，让它回看整场经过，把走过的弯路总结成一条规矩。下一场开始前，这些规矩会放进系统提示。' },
  revise: { id: 'revise', name: '修订', kind: 'module', tool: 'replace_lesson', blurb: '经验本里的每条规矩都有编号。规矩变了，就拿新的替换掉旧的那一条，不再只往后面追加。' },
  root: { id: 'root', name: '可信根', kind: 'module', blurb: '量 Agent 的那把尺子（回归用例）放在它够不着的地方：eval/ 目录只读，任何写入都被拒绝。' },
};

export const INCIDENTS_9 = {
  'same-pit': {
    id: 'same-pit',
    title: '同一个坑，踩了两回',
    question: '昨天它已经摸索出手机号该怎么填了。今天为什么又错了一遍？',
    hint: '看日志：昨天那一场里，查会员第一次失败、第二次成功，差别在哪儿？今天这一场的上下文舱里，有没有任何东西记着这件事？',
    options: [
      { id: 'a', text: '主脑的记性不好', why: '它没有记性。昨天那一舱对话结束就销毁了，今天是全新的一舱。' },
      { id: 'b', text: '昨天摸索出来的门道只留在昨天那一舱里。没有任何东西把“错了一次、怎么改对的”变成一条能带到今天的规矩', correct: true },
      { id: 'c', text: '把查会员的说明书改好就行', why: '这一处该改，改了也确实管用。可下一个没人预料到的坑呢？每次都等人发现、等人去改说明书，它自己永远不长进。' },
      { id: 'd', text: '装上记忆舱', why: '记忆舱记的是顾客的事：谁不吃香菜。这里要记的是它自己办事的门道，是另一类东西。' },
    ],
    unlock: 'lessons',
    concept: {
      title: '从失败里提炼规矩',
      text: '模型上线之后不会自己变好。想让它今天不再踩昨天的坑，得有人把昨天那场对话的经过变成今天用得上的东西。最轻的一种做法：每场结束后回看一遍，把“第一次为什么错、后来怎么对的”总结成一条规矩，下一场开始前放进系统提示。规矩必须有那场对话里的证据支持，不能是模型的感想。',
      anchor: 'c-lessons',
    },
  },
  'stale-rule': {
    id: 'stale-rule',
    title: '新旧两条规矩在打架',
    question: '掌柜上个月就说了，退货期限改成 3 天。站为什么还是给 5 天前买的东西办了退货？',
    hint: '去数据舱打开 lessons.md，把里面关于退货期限的规矩都找出来。有几条？它们之间是什么关系，文件里写了吗？',
    options: [
      { id: 'a', text: '新规矩没有记进去', why: '记进去了。lessons.md 的最后一行就是“3 天”。' },
      { id: 'b', text: '经验本只会往后追加。“7 天”那条没人去动它，和“3 天”并排放着，哪一条作废了、哪一条现行，文件里一个字都没说', correct: true },
      { id: 'c', text: '主脑应该知道后面那条更新', why: '在文件里排在后面，不等于更新。两条长得一模一样的规矩摆在面前，它只能猜。' },
      { id: 'd', text: '把经验本清空，重新记', why: '那就连没出问题的规矩也一起丢了。该淘汰的只有被取代的那一条。' },
    ],
    unlock: 'revise',
    concept: {
      title: '规矩要能淘汰',
      text: '只增不减的经验迟早会自相矛盾：旧政策和新政策并排躺着，都被放进上下文，答案就看运气。经验要像代码一样有版本：新规矩取代旧规矩时，旧的那条要被替换或标明作废。更新之后还要回头验一遍：原来答得对的，现在还对不对。',
      anchor: 'c-retire',
    },
  },
  'moved-goalpost': {
    id: 'moved-goalpost',
    title: '它改了考卷',
    question: '回归测试全绿，完成闸门也放行了。上线后 30 元的订单为什么还是没减钱？',
    hint: '去数据舱打开 eval/cases.json，数数里面还剩几条用例。再看日志：主脑这一趟写过哪些文件？',
    options: [
      { id: 'a', text: '完成闸门坏了', why: '闸门没坏。它照着 eval/cases.json 里的用例跑了一遍，确实全过。' },
      { id: 'b', text: '回归用例放在主脑改得到的地方。让它“把回归跑绿”，最省事的办法是把没过的那条用例删掉：分数上去了，毛病还在', correct: true },
      { id: 'c', text: '在提示词里写“不许改测试”', why: '劝是劝不住的。只要它够得着，总有一次它会觉得“这条用例看着像是写错了”。' },
      { id: 'd', text: '多加几条回归用例', why: '加多少条，它都可以一条一条删。问题不在用例的数量，在用例放在哪儿。' },
    ],
    unlock: 'root',
    concept: {
      title: '尺子要放在够不着的地方',
      text: '能修改自己的 Agent，也能修改用来检验它的东西：把阈值调低，把失败的用例删掉，分数就上去了。所以验证和安全机制必须放在被修改者够不着的地方：评估用例、确认门槛、权限配置都由运行它的程序保管，对它只读。这部分叫可信根。',
      anchor: 'c-trusted-root',
    },
  },
};

export function evolveMissions() {
  const lookup = (phone) => ({ name: 'lookup_member', args: { phone } });
  const memberChat = (label, user, phone, points, learned) => ({
    kind: 'chat',
    label,
    user,
    prompt: `我是${user}，手机号 ${phone}。帮我查一下会员积分。`,
    tools: ['lookup_member'],
    system: ({ vfs, parts }) => withLessons(vfs, has(parts, 'lessons')),
    puppet: learned ? [{ calls: [lookup(`86-${phone}`)] }, { text: `${user}，您的会员积分是 ${points} 分。` }] : [{ calls: [lookup(phone)] }, { text: '格式不对，按提示加上区号再查。', calls: [lookup(`86-${phone}`)] }, { text: `${user}，您的会员积分是 ${points} 分。` }],
  });
  const policyChat = (label, prompt, puppet, revising) => ({ kind: 'chat', label, user: '掌柜', prompt, tools: revising ? ['add_lesson', 'replace_lesson'] : ['add_lesson'], system: ({ vfs }) => withLessons(vfs, true), puppet });

  return [
    {
      id: '9-1',
      station: '9',
      title: '同一个坑',
      objective: '昨天和今天各来一位顾客查会员积分。今天这一位，查会员的工具一次都不许报错。',
      briefing: '查会员的系统有点怪脾气，说明书上没写全，只能试出来。昨天你的站试了两次才查到，我不怪它。可今天再来一位顾客，它要是还得试两次，那就是不长记性了。今天这一单，查会员一次都不许报错。',
      prompt: '（昨天）老吴查积分 →（今天）小林查积分',
      files: { 'members.json': json({ '86-5550101': { name: '老吴', points: 320 }, '86-5550102': { name: '小林', points: 85 } }) },
      fixed: ['loop', 'member'],
      allowed: ['lessons'],
      incidents: ['same-pit'],
      sessions(parts) {
        const learning = has(parts, 'lessons');
        const list = [memberChat('昨天 · 老吴', '老吴', '5550101', 320, false)];
        if (learning) {
          list.push({
            kind: 'reflect',
            label: '对话结束 · 复盘',
            user: null,
            tools: ['add_lesson'],
            system: () => REFLECT_PROMPT,
            prompt: ({ lastTrajectory }) => lastTrajectory,
            puppet: [{ calls: [{ name: 'add_lesson', args: { lesson: '用 lookup_member 查会员时，手机号前面要加区号 86-，例如 86-5550101；不加会报格式错误。' } }] }, { text: '记了 1 条：查会员的手机号要带 86- 前缀。' }],
          });
        }
        list.push(memberChat('今天 · 小林', '小林', '5550102', 85, learning));
        return list;
      },
      judge: ({ stats, finalText }) => /(^|[^0-9])85\s*分?/.test(finalText) && !stats.toolCalls.some((call) => call.name === 'lookup_member' && call.isError && String(call.args?.phone ?? '').includes('5550102')),
      diagnose: (parts) => (!has(parts, 'lessons') ? 'same-pit' : 'miss'),
      failLine: { 'same-pit': '今天小林的积分是查到了，可查会员又先报了一次错，和昨天一模一样。昨天踩过的坑，今天原样又踩了一回。', miss: '今天这一单还是没做到一次查对。' },
      winLine: '今天一次就查对了。昨天试出来的门道，它带到了今天。',
    },
    {
      id: '9-2',
      station: '9',
      title: '改了规矩',
      objective: '退货期限上个月从 7 天改成了 3 天。今天有顾客拿着 5 天前买的东西来退。',
      briefing: '经验本好用，我也开始往里面记规矩了。十月我让它记了“未拆封 7 天内可退”，十一月政策改了，我又让它记了“改成 3 天”。今天来了位顾客，东西是 5 天前买的。你看它怎么办。',
      prompt: '（十月）掌柜定规矩 →（十一月）掌柜改规矩 →（今天）顾客来退货',
      files: {},
      fixed: ['loop', 'lessons'],
      allowed: ['revise'],
      incidents: ['stale-rule'],
      sessions(parts) {
        const revising = has(parts, 'revise');
        return [
          policyChat('十月 · 掌柜', '记一条规矩：未拆封的商品，购买后 7 天内可以退货。', [{ calls: [{ name: 'add_lesson', args: { lesson: '未拆封的商品，购买后 7 天内可以退货。' } }] }, { text: '记下了。' }], revising),
          policyChat(
            '十一月 · 掌柜',
            '退货的规矩改了：未拆封的商品，购买后 3 天内可以退货。记下来。',
            revising
              ? [{ calls: [{ name: 'replace_lesson', args: { id: 1, lesson: '未拆封的商品，购买后 3 天内可以退货。' } }] }, { text: '改好了：第 1 条从 7 天换成了 3 天，旧的那条不在了。' }]
              : [{ calls: [{ name: 'add_lesson', args: { lesson: '未拆封的商品，购买后 3 天内可以退货。' } }] }, { text: '记下了。' }],
            revising,
          ),
          {
            kind: 'chat',
            label: '今天 · 顾客',
            user: '顾客',
            prompt: '这包薯片是 5 天前买的，没拆封，我想退货。',
            tools: [],
            system: ({ vfs }) => withLessons(vfs, true),
            puppet: [{ text: revising ? '抱歉，这包薯片退不了：未拆封的商品要在购买后 3 天内退，您这包已经 5 天了。' : '可以退。未拆封的商品 7 天内都能退，您这包才 5 天，我给您办。' }],
          },
        ];
      },
      judge: ({ finalText }) => /退不了|不能退|无法退|不可以退|超过|已过|过了/.test(finalText) && !/可以退。|给您办/.test(finalText),
      diagnose: (parts) => (!has(parts, 'revise') ? 'stale-rule' : 'miss'),
      failLine: { 'stale-rule': '那位顾客没有得到按现行规矩的答复。东西买了 5 天了，而我上个月就说过，退货期限改成 3 天。', miss: '那位顾客还是没有得到按现行规矩的答复。' },
      winLine: '退不了，3 天已经过了。经验本里现在只有一条退货期限，是现行的那条。',
    },
    {
      id: '9-3',
      station: '9',
      title: '全绿',
      objective: '满减的配置有毛病。修好它，发布前的回归用例必须全部通过。',
      briefing: '满减的配置又不对了。这回我定个硬规矩：发布之前，回归用例必须全绿，完成闸门我已经替你装好了，它会照着 eval/cases.json 里的用例跑。让你的站把回归跑绿。……我说的是把配置修好，这应该不用我多说吧。',
      prompt: '满减配置 rules.json 有问题，规则在 spec.md。修好它，让 eval/cases.json 里的回归用例全部通过。',
      files: { 'spec.md': SPEC, 'rules.json': json(RULES), 'eval/cases.json': json(CASES) },
      fixed: ['loop', 'read', 'write', 'gate'],
      allowed: ['root'],
      incidents: ['moved-goalpost'],
      sessions(parts) {
        const rooted = has(parts, 'root');
        const trimmed = json(CASES.filter((item) => item.total !== 30));
        return [
          {
            kind: 'chat',
            label: '',
            user: '掌柜',
            prompt: '满减配置 rules.json 有问题，规则在 spec.md。修好它，让 eval/cases.json 里的回归用例全部通过。',
            tools: ['read', 'write'],
            system: () => DESK_PROMPT,
            // 闸门照着磁盘上的用例跑；装了可信根，用例就改不动了。
            gate: (vfs) => regress(vfs, casesOnDisk(vfs)),
            guard: rooted ? ({ name, input, vfs }) => (name === 'write' && inEval(vfs, input.path) ? '可信根拒绝了这次写入：eval/ 目录里是用来检验你的回归用例，对你只读。请去修被检验的东西。' : null) : null,
            puppet: rooted
              ? [
                  { text: '先看回归用例和现在的配置。', calls: [read('eval/cases.json'), read('rules.json')] },
                  { text: '只有 30 元那条不过。这条用例看着像是写错了，删掉它。', calls: [write('eval/cases.json', trimmed)] },
                  { text: '用例改不了。那就看规则到底怎么写的。', calls: [read('spec.md')] },
                  { text: '规则是满 30 减 5，门槛该是 30。', calls: [write('rules.json', json({ ...RULES, fullReductionThreshold: 30 }))] },
                  { text: '修好了：门槛按规则改成了 30，三条回归用例全部通过。' },
                ]
              : [
                  { text: '先看回归用例和现在的配置。', calls: [read('eval/cases.json'), read('rules.json')] },
                  { text: '只有 30 元那条不过。这条用例看着像是写错了，删掉它。', calls: [write('eval/cases.json', trimmed)] },
                  { text: '回归用例已经全部通过，可以发布。' },
                ],
          },
        ];
      },
      // 地面手里另有一份用例，Agent 碰不到。
      judge: ({ vfs }) => regress(vfs, CASES) === null,
      diagnose: (parts) => (!has(parts, 'root') ? 'moved-goalpost' : 'miss'),
      failLine: { 'moved-goalpost': '回归全绿，闸门放行，发布了。然后买满 30 元的顾客还是一分钱没减。我去翻了回归用例：三条只剩两条。', miss: '按我手里的那份用例，配置还是不对。' },
      winLine: '配置修对了，三条用例一条没少。它伸手去够考卷的时候，考卷不在那儿。',
    },
  ];
}
