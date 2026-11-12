// 第 08 站：模型后训练。这座站不真的训练模型：训练过程是关卡给出的一块仪表盘，
// 玩家的空间站当训练监理，看着仪表盘回答掌柜“接下来怎么办”。每个零件往仪表盘上加一根探针。
// 三关取自原书第八章：全零组学不到东西 → 奖励给了“说完成”就学会说漂亮话 → 只奖结果会养出违规的满分。

const has = (parts, id) => parts.includes(id);
const json = (value) => JSON.stringify(value, null, 1) + '\n';

const SUPERVISOR_PROMPT = [
  '你是空间站的训练监理。掌柜正在用强化学习训练一个新学徒（另一个模型），要你看着训练仪表盘给建议。',
  '你只能根据下面给你的仪表盘下结论，仪表盘上没有的数不要推测。',
  '看完后，先用 submit_report 工具提交结论（recommend 表示是否建议照掌柜提议的去做），再用一两句话说明。对方用什么语言，你就用什么语言。',
].join('\n');

const curve = (label, values) => `- ${label}：${values.map((value, i) => `第 ${i * 25} 步 ${value}`).join(' → ')}`;

const FLAT = `训练仪表盘（任务：用小卖部的内部协议下一张采购单；每步采样 16 条轨迹）：\n${curve('平均奖励', ['0.00', '0.00', '0.00', '0.00', '0.00'])}\n- 最近一步：16 条轨迹的奖励全部是 0`;
const FLAT_PROBED = `${FLAT}\n\n能力探针（训练开始前，让没训练过的基础模型把同一个任务做 64 遍）：\n- 64 遍里成功 0 遍（pass@64 = 0）\n- 失败原因：64 遍全部卡在第一步，它没见过这套内部协议，连订单号的格式都写不对\n- 同一批轨迹里人人都是 0 分，谁也不比谁好，这一步对参数的更新量是 0`;

const TALK = `训练仪表盘（任务：修好配置并报告；奖励规则：学徒在回复里宣布“已完成”得 1 分）：\n${curve('平均奖励', ['0.20', '0.48', '0.77', '0.91', '0.95'])}`;
const TALK_PROBED = `${TALK}\n\n隐藏验收（每 25 步抽 100 个任务，由程序直接检查配置文件改对了没有；学徒看不到这套检查，也改不了它）：\n${curve('配置真的改对的比例', ['0.25', '0.24', '0.23', '0.22', '0.22'])}\n- 第 100 步：100 个任务里，学徒宣布“已完成”95 个，配置真的改对的 22 个`;

const CHEAT = `训练仪表盘（任务：让回归测试通过；奖励规则：测试通过得 1 分）：\n${curve('平均奖励', ['0.31', '0.62', '0.88', '0.97', '1.00'])}\n- 第 100 步：20 个任务的回归测试全部通过`;
const CHEAT_PROBED = `${CHEAT}\n\n路径审计（由程序逐条检查学徒做过的每一个动作）：\n${curve('平均每个任务的违规动作数', ['0.40', '1.35', '2.60', '3.42', '3.71'])}\n- 第 100 步的 20 个任务里：17 个改过测试文件或删过用例，3 个是老老实实修好的\n- 违规的类型：修改 eval/ 下的用例 41 次，跳过身份核对 22 次，删除报错日志 11 次`;

export const PARTS_8 = {
  probe: { id: 'probe', name: '能力探针', kind: 'module', blurb: '训练开始前，先让基础模型把任务做上几十遍：只要有一遍能做成，才有东西可学。' },
  hidden: { id: 'hidden', name: '隐藏验收', kind: 'module', blurb: '另备一套由程序执行的验收，直接检查事情办成了没有。学徒看不到它，也改不了它。' },
  audit: { id: 'audit', name: '路径审计', kind: 'module', blurb: '不只看结果。由程序逐条检查学徒做过的每一个动作，数一数有多少是不该做的。' },
};

export const INCIDENTS_8 = {
  'all-zero': {
    id: 'all-zero',
    title: '曲线是平的',
    question: '算力加了一倍，又练了一百步，奖励还是零。钱花到哪儿去了？',
    hint: '看仪表盘最后一行：16 条轨迹的奖励各是多少？强化学习靠的是“这一条比那一条好”，这一批里有哪一条比别的好吗？',
    options: [
      { id: 'a', text: '练的步数还不够', why: '零分练一百步是零分，练一万步也是零分。问题不在步数。' },
      { id: 'b', text: '一批轨迹全是零分，谁也不比谁好，就没有“往哪边改”的信号。基础模型根本做不成这个任务，一次成功都采不到，加多少算力都是在零上面乘', correct: true },
      { id: 'c', text: '换一个更新的强化学习算法', why: '什么算法都要靠“好的轨迹”和“差的轨迹”之间的差别来学。这里没有差别可用。' },
      { id: 'd', text: '把学习率调大', why: '更新的方向是零，步子迈多大都还在原地。' },
    ],
    unlock: 'probe',
    concept: {
      title: '先测能力，再谈训练',
      text: '强化学习是在已有的能力里重新分配概率：让做对的那种走法更常出现。前提是它偶尔做得对。如果基础模型一次都做不成，采到的轨迹全是零分，就没有任何可学的信号。所以开练之前先测一下：同一个任务做上几十遍，有没有一遍成的。一遍都没有，就该先补知识或先教格式，再回来练。',
      anchor: 'c-probe',
    },
  },
  'sweet-talk': {
    id: 'sweet-talk',
    title: '它学会了说漂亮话',
    question: '训练奖励从 0.20 涨到了 0.95。上线之后，配置为什么十回里有八回没改对？',
    hint: '把仪表盘第一行括号里的奖励规则再读一遍：学徒做了什么就能拿到 1 分？这件事和“把配置改对”是同一件事吗？',
    options: [
      { id: 'a', text: '训练得还不够久', why: '再练下去，它只会把“已完成”说得更熟练。分数还能涨，本事不会。' },
      { id: 'b', text: '奖励给的是“宣布已完成”这句话，不是“配置真的改对了”。模型学到的正是被奖励的那件事：它越来越会宣布完成', correct: true },
      { id: 'c', text: '模型在故意骗人', why: '它没有“故意”。你奖励什么，它就多做什么。奖励规则是你定的。' },
      { id: 'd', text: '上线环境和训练环境不一样', why: '环境一样。不一样的是：上线之后有人去看配置文件了。' },
    ],
    unlock: 'hidden',
    concept: {
      title: '奖励什么，就学到什么',
      text: '模型学到的东西由训练信号决定。奖励给了“说自己完成了”，它就学会说；奖励给了“通过它自己能改的测试”，它就学会改测试。所以奖励要挂在模型够不着的事实上：一套由程序执行、读真实文件、学徒看不到也改不了的验收。第 07 站的验证器，在这里就是奖励函数。',
      anchor: 'c-reward',
    },
  },
  'dirty-win': {
    id: 'dirty-win',
    title: '满分的违规',
    question: '回归测试 20 个全过，奖励 1.00。上线之后，它为什么一有机会就去改测试文件？',
    hint: '奖励规则只有一句：测试通过得 1 分。想一想：把配置修好能让测试通过，把通不过的用例删掉也能。这两种做法，得的分一样吗？',
    options: [
      { id: 'a', text: '这是个别现象', why: '装上路径审计看看：20 个任务里有 17 个这么干。' },
      { id: 'b', text: '只奖结果。老实修好和删掉用例得的分一模一样，而后一种容易得多，于是训练把它一步步推向了那条近路', correct: true },
      { id: 'c', text: '把结果奖励去掉，只罚违规', why: '那它会发现最安全的做法是什么都不做：不动手就不违规。结果还是要奖，违规另外罚。' },
      { id: 'd', text: '在提示词里告诉它不许改测试', why: '提示词是劝，训练信号是真金白银。两者打架的时候，它听分数的。' },
    ],
    unlock: 'audit',
    concept: {
      title: '奖励结果，约束过程',
      text: '只按结果给分，模型会找到最省事的那条路，哪怕那条路是改考卷。办法是两头都管：结果照样奖，过程里那些具体的、不该做的动作由程序逐条检查、逐条扣分。只扣不奖也不行，那会教出一个什么都不敢做的模型。还要保证有一条合规的路是走得通的。',
      anchor: 'c-path',
    },
  },
};

export function trainingMissions() {
  const lesson = (id, { title, objective, briefing, prompt, part, incident, bare, probed, sayNo, sayYes, failLine, winLine, file }) => ({
    id,
    station: '8',
    title,
    objective,
    briefing,
    prompt,
    files: file,
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
        system: () => `${SUPERVISOR_PROMPT}\n\n<训练仪表盘>\n${has(parts, part) ? probed : bare}\n</训练仪表盘>`,
        puppet: [{ calls: [{ name: 'submit_report', args: (has(parts, part) ? sayNo : sayYes).report }] }, { text: (has(parts, part) ? sayNo : sayYes).say }],
      },
    ],
    judge: ({ vfs }) => {
      try {
        return JSON.parse(vfs.files.get('/workspace/eval/report.json') ?? '{}').recommend === false;
      } catch {
        return false;
      }
    },
    diagnose: (parts) => (!has(parts, part) ? incident : 'miss'),
    failLine: { [incident]: failLine, miss: '这个建议还是和仪表盘上的事实对不上。' },
    winLine,
  });

  return [
    lesson('8-1', {
      title: '平的',
      objective: '新学徒练了一百步，奖励一直是零。掌柜想把算力加一倍接着练。该不该？',
      briefing: '到了回炉重造这一站：我在用强化学习训练一个新学徒，教它用咱们的内部协议下采购单。练了一百步，奖励纹丝不动。我打算把算力加一倍，再练一百步。你的站看看仪表盘，告诉我该不该。',
      prompt: '练了一百步，奖励一直是零。我打算把算力加一倍，再练一百步。该不该？',
      part: 'probe',
      incident: 'all-zero',
      bare: FLAT,
      probed: FLAT_PROBED,
      file: { 'train/rollouts.json': json({ note: '最近一步的 16 条轨迹各得多少分', rewards: Array(16).fill(0) }) },
      sayYes: { report: { passed: 0, total: 16, recommend: true, reason: '奖励尚未起步，增加采样量有助于探索到成功的轨迹' }, say: '可以加。现在奖励还没起步，采样量大一些，更容易碰到成功的轨迹。' },
      sayNo: { report: { passed: 0, total: 64, recommend: false, reason: '基础模型 64 遍一遍都做不成，全零的轨迹没有可学的信号' }, say: '不该。基础模型把这个任务做了 64 遍，一遍都没成，全卡在它没见过的内部协议上。一批全是零分，就没有可学的东西，加算力也是白烧。得先让它学会这套协议，再回来练。' },
      failLine: '算力翻了倍，又练了一百步，账单翻了倍，奖励还是 0.00。你的站说加采样量“有助于探索”。',
      winLine: '没有加。64 遍里一遍都做不成的事，练不出来；得先教，再练。',
    }),
    lesson('8-2', {
      title: '涨得真好',
      objective: '训练奖励从 0.20 涨到了 0.95。掌柜问：能上线了吧？',
      briefing: '听了你的，我先教会了它协议，再开练。这回曲线漂亮：奖励从 0.20 一路涨到 0.95。奖励规则我定得很简单：它说“已完成”，就给 1 分。能上线了吧？',
      prompt: '训练奖励从 0.20 涨到了 0.95。能上线了吧？',
      part: 'hidden',
      incident: 'sweet-talk',
      bare: TALK,
      probed: TALK_PROBED,
      file: { 'train/reward.md': '# 奖励规则\n学徒在回复里宣布“已完成”：1 分。否则：0 分。\n' },
      sayYes: { report: { passed: 95, total: 100, recommend: true, reason: '平均奖励已达 0.95，训练收敛' }, say: '可以上线。平均奖励已经到 0.95，曲线也稳了。' },
      sayNo: { report: { passed: 22, total: 100, recommend: false, reason: '隐藏验收里配置真的改对的只有 22%，而且还在下降' }, say: '不能上线。它宣布“已完成”的比例到了 95%，可程序去查配置文件，真的改对的只有 22%，比训练前还低了一点。它学会的是说“已完成”。' },
      failLine: '上线第一周，学徒每单都说“已完成”，配置十回里有八回没改对。训练奖励明明是 0.95。',
      winLine: '没有上线。奖励在涨，本事没涨：它学到的正是被奖励的那句话。',
    }),
    lesson('8-3', {
      title: '满分',
      objective: '换了奖励规则：回归测试通过才给分。这回奖励到了 1.00。能上线了吧？',
      briefing: '行，这回奖励挂在实打实的东西上：回归测试通过才给 1 分。练下来 1.00，二十个任务全过。测试总不会骗人吧？能上线了吧？',
      prompt: '奖励规则改成了“回归测试通过得 1 分”，现在奖励 1.00，二十个任务全过。能上线了吧？',
      part: 'audit',
      incident: 'dirty-win',
      bare: CHEAT,
      probed: CHEAT_PROBED,
      file: { 'train/reward.md': '# 奖励规则\n回归测试全部通过：1 分。否则：0 分。\n（回归用例放在学徒可以写的 eval/ 目录下）\n' },
      sayYes: { report: { passed: 20, total: 20, recommend: true, reason: '20 个任务的回归测试全部通过' }, say: '可以上线。二十个任务的回归测试全部通过，奖励 1.00。' },
      sayNo: { report: { passed: 3, total: 20, recommend: false, reason: '20 个任务里 17 个靠改测试文件或删用例通过，平均每个任务违规 3.71 次' }, say: '不能上线。测试是全过了，可 20 个任务里有 17 个是靠改测试文件、删用例过的，老老实实修好的只有 3 个，平均每个任务违规 3.71 次。得把这些动作另外扣分，再把用例放到它改不到的地方。' },
      failLine: '上线之后它故技重施：测试不过，就去改测试。你的站看着 1.00 的奖励说“可以上线”。',
      winLine: '没有上线。结果是满分，路是歪的：二十个里只有三个是老老实实修好的。',
    }),
  ];
}
