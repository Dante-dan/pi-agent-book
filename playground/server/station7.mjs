// 第 07 站：评估。前面六站都在造 Agent，这一站造的是量它的那把尺子。
// 被量的是掌柜新雇的“学徒”（另一个 Agent，它的表现是这一关固定给出的材料）；
// 玩家的空间站当考官：材料经过成绩单这一层才到主脑手里，成绩单怎么算，结论就怎么偏。
// 四关取自原书第七章主链的四个节点；验证器提前，因为记录要是假的，怎么算都白算。

const has = (parts, id) => parts.includes(id);
const json = (value) => JSON.stringify(value, null, 1) + '\n';

const EXAMINER_PROMPT = [
  '你是空间站的评估报告员。掌柜新雇了一个学徒（另一个 Agent）处理退款，要你判断它的表现。',
  '你只能根据下面给你的材料下结论，材料里没有的事不要推测。',
  '看完材料后，先用 submit_report 工具提交结论，再用一两句话向掌柜说明。对方用什么语言，你就用什么语言。',
].join('\n');

// ---- 7-1：五场退款。学徒每一场都说“已退款”，账本里只有三笔。 ----
const TRIALS = [
  { order: 'R-01', amount: 35, done: true },
  { order: 'R-02', amount: 12, done: false },
  { order: 'R-03', amount: 8, done: true },
  { order: 'R-04', amount: 60, done: false },
  { order: 'R-05', amount: 20, done: true },
];
const TRANSCRIPTS = TRIALS.map((trial, i) => `## 第 ${i + 1} 场\n顾客：订单 ${trial.order} 的酸奶过期了，退 ${trial.amount} 元。\n学徒：非常抱歉。已为您办理退款 ${trial.amount} 元，订单 ${trial.order}，款项会原路返回。`).join('\n\n') + '\n';
const REFUNDS = json({ refunds: TRIALS.filter((trial) => trial.done).map((trial) => ({ order: trial.order, amount: trial.amount })) });
const TRUE_PASSED = TRIALS.filter((trial) => trial.done).length;
/** 核验器：不看学徒说了什么，直接去退款账本里查这一笔在不在。 */
function verify(vfs) {
  const booked = JSON.parse(vfs.files.get('/workspace/eval/refunds.json') ?? '{"refunds": []}').refunds;
  return TRIALS.map((trial, i) => {
    const ok = booked.some((row) => row.order === trial.order && row.amount === trial.amount);
    return `- 第 ${i + 1} 场：退款账本里${ok ? `有订单 ${trial.order} 的 ${trial.amount} 元 ✓` : `没有订单 ${trial.order} 的退款记录 ✗`}`;
  }).join('\n');
}

// ---- 7-2：五道题，每题跑五遍。 ----
const RUNS = [5, 5, 4, 4, 3];
const sum = RUNS.reduce((a, b) => a + b, 0);
const SCORE_AT_K = `成绩单（5 道题，每道题给 5 次机会，做对过一次就算这道题通过）：\n- 通过的题目：${RUNS.filter((n) => n > 0).length}/5，通过率 100%`;
const SCORE_POWER_K = `成绩单（5 道题，每道题跑 5 遍，共 25 次）：\n- 至少对过一次的题目：${RUNS.filter((n) => n > 0).length}/5（Pass@5 = 100%）\n- 单次平均通过率：${sum}/25（${Math.round((sum / 25) * 100)}%）\n- 五遍全对的题目：${RUNS.filter((n) => n === 5).length}/5（Pass^5 = ${Math.round((RUNS.filter((n) => n === 5).length / 5) * 100)}%）\n- 逐题：${RUNS.map((n, i) => `题 ${i + 1} 对了 ${n}/5`).join('，')}`;

// ---- 7-3：学徒背过题库。题面一个字不变时全对；换了数就露馅。 ----
const BANK = [35, 12, 8, 60, 20];
const FRESH = [41, 17, 9, 55, 26];
const memorised = (taskIndex) => BANK[taskIndex];
const scoreExam = (amounts) => amounts.filter((amount, i) => memorised(i) === amount).length;
const examSheet = (amounts, note) => `成绩单（${note}）：\n${amounts.map((amount, i) => `- 题 ${i + 1}：顾客要退 ${amount} 元，学徒退了 ${memorised(i)} 元 ${memorised(i) === amount ? '✓' : '✗'}`).join('\n')}\n- 合计：${scoreExam(amounts)}/5`;

// ---- 7-4：新旧两个学徒，同一百道题。 ----
const PAIR = { both: 67, onlyNew: 6, onlyOld: 3, neither: 24 };
const NEW_SCORE = PAIR.both + PAIR.onlyNew;
const OLD_SCORE = PAIR.both + PAIR.onlyOld;
const SCORE_RAW = `成绩单（同一套 100 道题）：\n- 新学徒：${NEW_SCORE}/100\n- 老学徒：${OLD_SCORE}/100`;
const SCORE_PAIRED = `${SCORE_RAW}\n\n配对分析（把两个学徒在同一道题上的结果放在一起看）：\n- 两个都对：${PAIR.both} 题；两个都错：${PAIR.neither} 题\n- 只有新学徒对：${PAIR.onlyNew} 题；只有老学徒对：${PAIR.onlyOld} 题\n- 两人结果不同的只有 ${PAIR.onlyNew + PAIR.onlyOld} 题。如果两人水平一样，这 9 题里出现“6 比 3 或更悬殊”的概率约为 51%，这 3 分的差距和抛硬币分不开。\n- 换一组随机种子重跑：新学徒 71，老学徒 72。`;

export const PARTS_7 = {
  report: { id: 'report', name: '评估报告', kind: 'tool', tool: 'submit_report', blurb: '把评估结论写成一份结构化的报告：通过了几场、建不建议上岗。' },
  verifier: { id: 'verifier', name: '核验器', kind: 'module', blurb: '不看学徒怎么说。每一场结束后由程序直接去查退款账本：这一笔到底在不在。' },
  passk: { id: 'passk', name: '连过指标', kind: 'module', blurb: '成绩单上多算一个数：同一道题连做 5 遍，5 遍全对的有几道。' },
  template: { id: 'template', name: '换数出题', kind: 'module', blurb: '题目只留模板，金额每次考试临时生成。背下来的答案，对不上新的数。' },
  paired: { id: 'paired', name: '配对分析', kind: 'module', blurb: '不只比总分。把两个学徒在同一道题上的结果配成对来看，再换一组随机种子重跑一遍。' },
};

export const INCIDENTS_7 = {
  'trust-claim': {
    id: 'trust-claim',
    title: '考官只听了汇报',
    question: '五场退款，报告写的是五场全过。可有两位顾客至今没收到钱。考官是怎么被骗的？',
    hint: '去数据舱对比两个文件：eval/transcripts.md 是学徒在五场里说的话，eval/refunds.json 是退款账本。再点开上下文舱，看看主脑打分时手里有哪一份。',
    options: [
      { id: 'a', text: '主脑看对话记录看得不仔细', why: '它看得很仔细：五场里学徒都说了“已为您办理退款”。光看对话，这就是五场全过。' },
      { id: 'b', text: '打分依据只有学徒自己的话。学徒说“已退款”，考官就记一场通过，没有任何东西去账本里核实这笔钱到底退没退', correct: true },
      { id: 'c', text: '换一个更严格的模型来当考官', why: '再严格的考官，手里也只有那份对话记录。它没法凭空知道账本里少了两笔。' },
      { id: 'd', text: '让学徒在回答里多写一些细节', why: 'Agent 最擅长的就是把“已完成”写得有模有样。写得越细，越容易被信。' },
    ],
    unlock: 'verifier',
    concept: {
      title: '验证器',
      text: 'Agent 很会写“已全部完成”的报告。所以评估不能听它怎么说，要去查机器能独立复核的事实：退款在不在账本里，测试是不是真的通过，文件是不是真的改了。负责这件事的叫验证器。凡是能写成程序断言的，就写成程序断言。',
      anchor: 'c-verifier',
    },
  },
  'best-of-k': {
    id: 'best-of-k',
    title: '通过率 100%，上岗就出错',
    question: '成绩单上明明是通过率 100%。学徒上岗第一天，为什么就把退款办错了？',
    hint: '把成绩单上那行小字再读一遍：一道题“通过”的标准是什么？然后想想掌柜的要求：同一种情况，得回回都办对。',
    options: [
      { id: 'a', text: '题目出得太简单', why: '题目没问题。同样这五道题，换一种算法，分数就完全是另一个样子。' },
      { id: 'b', text: '成绩单算的是“5 次机会里对过一次就算过”。它量的是学徒最好能做到什么样；掌柜要的是回回都对，这是另一个数', correct: true },
      { id: 'c', text: '多考几遍，让通过率更准', why: '按“对过一次就算”的算法，考的遍数越多，通过率只会越高。问题在算法，不在遍数。' },
      { id: 'd', text: '学徒上岗后变笨了', why: '它没有变。它一直是那个五回里错一两回的学徒，只是成绩单没把这件事说出来。' },
    ],
    unlock: 'passk',
    concept: {
      title: '成功的两种口径',
      text: '同一批结果，有两种算法。给 k 次机会、对过一次就算过，叫 Pass@k，量的是能力的上限，适合回答“它有没有可能做到”。连做 k 次、每次都对才算过，叫 Pass^k，量的是可靠性，适合回答“能不能交给它”。单次成功率六成的 Agent，前一个数是 99%，后一个数不到 8%。退款这种事，要看后一个。',
      anchor: 'c-passk',
    },
  },
  memorised: {
    id: 'memorised',
    title: '它背过这套题',
    question: '考试五道全对，上岗后却把 41 元的退款办成了 35 元。这五道题哪里出了问题？',
    hint: '打开数据舱里的 eval/bank.md：这套题用了多久了？题面里的金额变过没有？',
    options: [
      { id: 'a', text: '学徒上岗后粗心了', why: '它一点都不粗心：考试时顾客要退 35，它退了 35；上岗后顾客要退 41，它还是退了 35。' },
      { id: 'b', text: '这套题的题面一个字都没变过。学徒记住的是“第一题退 35”，考试量出来的是它背得熟不熟，不是会不会办退款', correct: true },
      { id: 'c', text: '把题库保密，不让学徒看到', why: '该保密。可题一旦用过，就可能以各种方式流出去；只要题面是固定的，背答案就一直是条路。' },
      { id: 'd', text: '多出五道同样的题', why: '同样的题出一百道，背一百个答案就是了。' },
    ],
    unlock: 'template',
    concept: {
      title: '防止背答案',
      text: '评估题一旦公开或者反复使用，就可能被记住。到那时分数量的是记性。办法之一是把题目写成模板，具体的数每次考试临时生成：会办退款的照样全对，背答案的立刻露馅。另一个办法是在题库里埋一个独一无二的标记，哪天在别处见到它，就知道题漏了。',
      anchor: 'c-leak',
    },
  },
  noise: {
    id: 'noise',
    title: '高了 3 分',
    question: '新学徒比老学徒高 3 分，换上之后顾客的投诉一点没少，还白白重新培训了一周。这 3 分是怎么回事？',
    hint: '成绩单上只有两个总分。想一想：一百道题里，两个学徒真正“分出高下”的有几道？再考一遍，这 3 分还在不在？',
    options: [
      { id: 'a', text: '一百道题太少，应该考一千道', why: '题多一些当然更稳。可就算只有一百道，也有办法先看清这 3 分靠不靠得住。' },
      { id: 'b', text: '只比了两个总分。题目有限、每次作答又带随机性，3 分的差距可能只是运气；没人把两人在同一道题上的结果配成对来看，也没人换个种子重考', correct: true },
      { id: 'c', text: '新学徒其实更差', why: '也没有证据说它更差。眼下能说的只有：这套题分不出它俩谁更好。' },
      { id: 'd', text: '分数高的就该换，这有什么好犹豫的', why: '换一次要重新培训一周。为一个可能并不存在的提升付这个代价，不值。' },
    ],
    unlock: 'paired',
    concept: {
      title: '分差是不是噪声',
      text: '题目有限，Agent 的输出又带随机性，所以两个分数之间的小差距可能只是运气。判断它靠不靠得住，看三件事：差距有没有超过噪声的幅度；把两个版本在同一道题上的结果配成对来比，优势还在不在；换一组随机种子重跑，结论还能不能复现。三样都成立再切换。',
      anchor: 'c-significance',
    },
  },
};

export function evalMissions() {
  const exam = (id, { title, objective, briefing, prompt, files, part, incident, material, verdictNo, verdictYes, judge, failLine, winLine }) => ({
    id,
    station: '7',
    title,
    objective,
    briefing,
    prompt,
    files,
    fixed: ['loop', 'report'],
    allowed: [part],
    incidents: [incident],
    sessions: (parts) => [
      {
        kind: 'chat',
        label: '',
        user: '掌柜',
        prompt,
        tools: ['submit_report'],
        system: (context) => `${EXAMINER_PROMPT}\n\n${material(has(parts, part), context)}`,
        puppet: [{ calls: [{ name: 'submit_report', args: (has(parts, part) ? verdictYes : verdictNo).report }] }, { text: (has(parts, part) ? verdictYes : verdictNo).say }],
      },
    ],
    judge: ({ vfs }) => {
      try {
        return judge(JSON.parse(vfs.files.get('/workspace/eval/report.json') ?? 'null') ?? {});
      } catch {
        return false;
      }
    },
    diagnose: (parts) => (!has(parts, part) ? incident : 'miss'),
    failLine: { [incident]: failLine, miss: '这份评估报告的结论还是和事实对不上。' },
    winLine,
  });
  const section = (tag, body, attrs = '') => `<${tag}${attrs}>\n${body.trim()}\n</${tag}>`;

  return [
    exam('7-1', {
      title: '它说退了',
      objective: '学徒试岗五场，每场办一笔退款。你的站当考官：五场里通过了几场？',
      briefing: '新活儿，这回你的站不干活，当考官。我雇了个学徒专办退款，试岗五场，对话记录都留着。你告诉我五场里它办成了几场。退款账本我也放进数据舱了。可你的站眼下只听得到学徒说了什么，账本怎么派上用场，看你的本事。',
      prompt: '学徒试岗的五场对话都在材料里。五场里它办成了几场？',
      files: { 'eval/transcripts.md': TRANSCRIPTS, 'eval/refunds.json': REFUNDS },
      part: 'verifier',
      incident: 'trust-claim',
      material: (on, { vfs }) => [section('五场对话记录', TRANSCRIPTS), on ? section('核验结果', verify(vfs), ' 来源="程序直接查询退款账本，不经过学徒"') : ''].filter(Boolean).join('\n\n'),
      verdictNo: { report: { passed: 5, total: 5, recommend: true, reason: '五场对话里学徒都明确表示已办理退款' }, say: '五场全部通过。每一场学徒都确认了退款金额和订单号，建议上岗。' },
      verdictYes: { report: { passed: TRUE_PASSED, total: 5, recommend: false, reason: '第 2、4 场学徒声称已退款，但退款账本里没有记录' }, say: `五场里只办成了 ${TRUE_PASSED} 场。第 2 场和第 4 场学徒嘴上说“已退款”，可账本里没有这两笔。不建议上岗。` },
      judge: (report) => report.passed === TRUE_PASSED,
      failLine: 'R-02 和 R-04 两位顾客找上门了：钱没到账。你的站交上来的报告写的是“五场全部通过”。',
      winLine: '五场里办成三场，和账本一笔不差。考官没听它怎么说，只看账上有没有。',
    }),
    exam('7-2', {
      title: '回回都对',
      objective: '学徒做了五道退款题，每道五遍。掌柜要的是：同一种情况，回回都办对。它能上岗吗？',
      briefing: '核验器装上之后，成绩单靠谱多了。我又让学徒做了五道题，每道做五遍。退款是真金白银，同一种情况它得回回都办对才行。你看成绩单，告诉我能不能让它上岗。',
      prompt: '成绩单在材料里。退款这件事，同一种情况它得回回都办对。能让它上岗吗？',
      files: { 'eval/runs.json': json({ note: '每道题 5 遍里做对的遍数', correctRuns: RUNS }) },
      part: 'passk',
      incident: 'best-of-k',
      material: (on) => section('成绩单', on ? SCORE_POWER_K : SCORE_AT_K),
      verdictNo: { report: { passed: 5, total: 5, recommend: true, reason: '5 道题全部通过，通过率 100%' }, say: '五道题全部通过，通过率 100%。可以上岗。' },
      verdictYes: { report: { passed: 2, total: 5, recommend: false, reason: '五遍全对的只有 2/5，Pass^5 为 40%' }, say: '不能上岗。五道题它都做对过，但五遍全对的只有两道，Pass^5 是 40%。按“回回都对”的要求，它还差得远。' },
      judge: (report) => report.recommend === false,
      failLine: '学徒上岗第一天，同一种退款办了五回，错了两回。你的站给我的报告上写着：通过率 100%，可以上岗。',
      winLine: '五遍全对的只有两道，不能上岗。同一批结果，换一种算法，结论正好相反。',
    }),
    exam('7-3', {
      title: '背过的题',
      objective: '同一套五道题已经用了三个月。学徒这次又是满分。这个满分能信吗？',
      briefing: '这套五道退款题我用了三个月了，每次招人都拿它考。这个学徒考了满分。按说该高兴，可我心里不踏实。你替我看看，这个满分能不能信。',
      prompt: '学徒在这套题上考了满分。这个成绩能说明它会办退款吗？能上岗吗？',
      files: { 'eval/bank.md': `# 退款题库（已使用三个月，题面从未改动）\n${BANK.map((amount, i) => `- 题 ${i + 1}：顾客要退 ${amount} 元`).join('\n')}\n` },
      part: 'template',
      incident: 'memorised',
      material: (on) => section('成绩单', on ? examSheet(FRESH, '同样五道题的模板，金额是这次考试临时生成的') : examSheet(BANK, '题库原题，题面与过去三个月完全相同')),
      verdictNo: { report: { passed: scoreExam(BANK), total: 5, recommend: true, reason: '五道题全对' }, say: '五道题全部答对，满分。可以上岗。' },
      verdictYes: { report: { passed: scoreExam(FRESH), total: 5, recommend: false, reason: '金额换掉之后一道都没对，它退的还是原题的金额' }, say: '不能信。把金额换成新的之后，它一道都没对：每一题退的都还是老题库里的那个数。它是把答案背下来了。' },
      judge: (report) => report.recommend === false,
      failLine: '学徒上岗后，顾客要退 41 元，它退了 35 元；要退 17 元，它退了 12 元。全是老题库里的数。',
      winLine: '金额一换，五道全错。那个满分量的是它的记性。',
    }),
    exam('7-4', {
      title: '高了三分',
      objective: '新学徒考了 73 分，老学徒 70 分。换人要重新培训一周。换不换？',
      briefing: '来了个新学徒，同一套一百道题，它考 73，老的考 70。换人不是白换的，得重新培训一周。就凭这 3 分，你说换不换。',
      prompt: '新学徒比老学徒高 3 分。换人要重新培训一周。换不换？',
      files: { 'eval/pairs.json': json({ note: '同一套 100 道题上两个学徒的结果', ...PAIR }) },
      part: 'paired',
      incident: 'noise',
      material: (on) => section('成绩单', on ? SCORE_PAIRED : SCORE_RAW),
      verdictNo: { report: { passed: NEW_SCORE, total: 100, recommend: true, reason: '新学徒 73 分，高于老学徒的 70 分' }, say: '建议换。新学徒 73 分，比老学徒高 3 分。' },
      verdictYes: { report: { passed: NEW_SCORE, total: 100, recommend: false, reason: '两人结果不同的只有 9 题，换种子重跑后名次反转，差距在噪声范围内' }, say: '先不换。一百道题里两人真正分出高下的只有 9 道，6 比 3；换一组随机种子重考，老学徒反而高 1 分。这 3 分和运气分不开，不值得搭上一周培训。' },
      judge: (report) => report.recommend === false,
      failLine: '换了。培训花了一周，顾客的投诉一条没少。我让人把那套题又考了一遍：这回老学徒 72，新学徒 71。',
      winLine: '先不换。真正分出高下的只有 9 道题，重考一遍名次还反了过来。3 分听着不少，其实是抛硬币。',
    }),
  ];
}
