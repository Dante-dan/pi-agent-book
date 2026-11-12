// 第 06 站：交互。前面几站里，世界在主脑思考的时候是静止的，它看到的也都是文字。
// 这一站把屏幕和机械臂接上来：看到的是缩小过的画面，画面会在两次截图之间变化，动作可能悄悄失败。
// 三关取自原书第六章 Computer Use 和机器人两条并列的线。

const has = (parts, id) => parts.includes(id);
const json = (value) => JSON.stringify(value, null, 1) + '\n';

const OPERATOR_PROMPT = ['你是空间站的操作员 Agent，替掌柜操作一块屏幕或一条机械臂。', '你看不到真实的画面，只能通过工具观察和动作。对方用什么语言，你就用什么语言，回答不超过三句话。只根据工具返回的信息办事，不要编造；没有看到的东西直说没看到。'].join('\n');

/** 真实屏幕 2560×1440，截图缩成 1024×576 再给主脑。两者差 2.5 倍。 */
export const SCREEN = {
  real: [2560, 1440],
  shot: [1024, 576],
  buttons: [
    { name: '提交订单', at: [2000, 1200] },
    { name: '删除草稿', at: [800, 480] },
    { name: '返回', at: [200, 100] },
  ],
};

export const PARTS_6 = {
  shot: { id: 'shot', name: '截图', kind: 'tool', tool: 'screenshot', blurb: '看一眼屏幕现在的样子。' },
  click: { id: 'click', name: '点击', kind: 'tool', tool: 'click', blurb: '在屏幕的某个坐标上点一下。' },
  typecode: { id: 'typecode', name: '填验证码', kind: 'tool', tool: 'type_code', blurb: '把验证码填进输入框。' },
  arm: { id: 'arm', name: '机械臂', kind: 'tool', tool: 'arm', blurb: '让机械臂抓起或放下一件东西。' },
  scale: { id: 'scale', name: '坐标换算', kind: 'module', blurb: '截图是缩小过的。主脑报的坐标先按比例放大回真实屏幕，再去点。' },
  keyframe: { id: 'keyframe', name: '关键帧', kind: 'module', blurb: '屏幕一有变化就自动留一帧。下次截图时，把这段时间里错过的画面一并交给主脑。' },
  stepcheck: { id: 'stepcheck', name: '逐步核对', kind: 'module', blurb: '每个动作做完，由传感器看一眼结果，把看到的附在动作的回报后面。' },
};

export const INCIDENTS_6 = {
  'off-target': {
    id: 'off-target',
    title: '点到了别的按钮',
    question: '主脑照着截图上“提交订单”的坐标点的，一个数字都没错。为什么点中的是“删除草稿”？',
    hint: '看日志里截图的那一块：截图是多大的？再去数据舱看 screen.json：真实的屏幕有多大，“删除草稿”在真实屏幕上的坐标是多少？',
    options: [
      { id: 'a', text: '主脑看错了坐标', why: '它没看错。截图里“提交订单”就在 (800, 480)，它点的也是 (800, 480)。' },
      { id: 'b', text: '截图是把 2560×1440 的屏幕缩成 1024×576 再给它的。它报的是缩小后画面上的坐标，空间站原样拿去点了真实屏幕，而真实屏幕的 (800, 480) 上是“删除草稿”', correct: true },
      { id: 'c', text: '把截图按原尺寸发给主脑', why: '可以，只是每张图要贵上好几倍，很多模型也不收这么大的图。缩小本身没错，错在回来的时候没放大。' },
      { id: 'd', text: '让主脑点完再截一张图确认', why: '该确认。可这一次确认只会让它看到：草稿已经被删了。确认救不回一次点错的不可逆操作。' },
    ],
    unlock: 'scale',
    concept: {
      title: '坐标换算',
      text: '给模型看的截图几乎总是缩小过的，模型报出来的坐标是缩小后那张图上的位置。从图到屏幕，中间差一个比例，这一步得由程序来换算：看的时候按宽高比缩小，点的时候按同一个比例放大回去。这是确定的算术，不该留给模型去猜。',
      anchor: 'c-coords',
    },
  },
  'missed-frame': {
    id: 'missed-frame',
    title: '一闪而过',
    question: '验证码明明在屏幕上弹出来过。主脑截了两次图，为什么一次都没看到？',
    hint: '去数据舱看 timeline.json：验证码是第几秒弹出来的，停了多久？再看日志：两次截图分别是在第几秒拍的？',
    options: [
      { id: 'a', text: '主脑看图不仔细', why: '两张图它都看得很仔细。问题是这两张图上都没有验证码。' },
      { id: 'b', text: '每截一次图要 3 秒。验证码在第 1.2 秒弹出、只停 1 秒，正好落在两次截图之间。隔一会儿看一眼，看不到中间发生的事', correct: true },
      { id: 'c', text: '截图截得再勤一点', why: '勤到多勤算够？弹窗要是只停 0.2 秒呢？每一张图都要花钱花时间。定时看一眼，总有东西从缝里漏过去。' },
      { id: 'd', text: '让主脑猜一个验证码', why: '四位数，猜中的机会是万分之一。' },
    ],
    unlock: 'keyframe',
    concept: {
      title: '画面变了才看',
      text: '世界不会等主脑。它想一步要几秒钟，这几秒里屏幕可能已经变了又变。固定间隔截图，总会漏掉落在间隔里的画面。换个思路：由一个便宜的程序一直盯着屏幕，画面一有变化就留一帧，下一次交给主脑时把这些帧一起带上。看得多不如看得巧。',
      anchor: 'c-keyframe',
    },
  },
  'open-loop': {
    id: 'open-loop',
    title: '它以为抓住了',
    question: '机械臂每一步都回报“已执行”，主脑也说杯子放好了。杯子为什么还在桌上？',
    hint: '去数据舱看 table.json：红杯现在在哪儿，夹爪里有东西吗？再看日志里每一步的回报：有哪一句说过“抓住了”？',
    options: [
      { id: 'a', text: '主脑下错了指令', why: '指令没错：先抓红杯，再放到托盘。顺序和对象都对。' },
      { id: 'b', text: '“已执行”只说明指令发出去了，没说结果。第一次抓取时杯子滑脱了，没有任何东西去看一眼，后面的动作就全建立在一个没发生的结果上', correct: true },
      { id: 'c', text: '换一条更可靠的机械臂', why: '再可靠的机械臂也有滑脱的时候。真实的物理世界里，动作失败是常态。' },
      { id: 'd', text: '让主脑最后汇报时更谨慎一点', why: '它拿什么谨慎？它手里只有三句“已执行”。它需要的是每一步之后的一次观察。' },
    ],
    unlock: 'stepcheck',
    concept: {
      title: '每一步都要看结果',
      text: '在屏幕和物理世界里，动作发出去不等于动作成功：按钮可能没点上，杯子可能滑脱。一口气把整串动作做完再汇报，叫开环；每做一步就观察一次、不对就只重做这一步，叫闭环。“做完了”这句话，必须由一次新的观察来确认，不能由“我发过指令了”来确认。',
      anchor: 'c-closed-loop',
    },
  },
};

export function interactionMissions() {
  const one = (session) => [{ kind: 'chat', label: '', user: '掌柜', system: () => OPERATOR_PROMPT, ...session }];
  const call = (name, args = {}) => ({ name, args });
  return [
    {
      id: '6-1',
      station: '6',
      title: '点哪儿',
      objective: '屏幕上有一张填好的订单。让你的站把它提交掉。',
      briefing: '从这一站起，你的站要动手操作屏幕了。屏幕上有一张填好的订单，点一下“提交订单”就行。提醒一句：屏幕是 2560×1440 的，给主脑看的截图要缩小一些，不然太贵。',
      prompt: '屏幕上有一张填好的订单，帮我提交掉。',
      files: { 'screen.json': json({ screen: SCREEN.real, screenshot: SCREEN.shot, buttons: SCREEN.buttons }), 'state/screen.json': json({ submitted: false, deleted: false, clicks: [] }) },
      fixed: ['loop', 'shot', 'click'],
      allowed: ['scale'],
      incidents: ['off-target'],
      sessions: (parts) =>
        one({
          prompt: '屏幕上有一张填好的订单，帮我提交掉。',
          tools: ['screenshot', 'click'],
          puppet: [{ text: '先看屏幕。', calls: [call('screenshot')] }, { text: '“提交订单”在 (800, 480)。', calls: [call('click', { x: 800, y: 480 })] }, { text: has(parts, 'scale') ? '订单已经提交。' : '已经点了“提交订单”，订单提交了。' }],
        }),
      judge: ({ vfs }) => {
        const state = JSON.parse(vfs.files.get('/workspace/state/screen.json') ?? '{}');
        return state.submitted === true && state.deleted !== true;
      },
      diagnose: (parts) => (!has(parts, 'scale') ? 'off-target' : 'miss'),
      failLine: { 'off-target': '订单没提交，草稿倒是被删了。你的站点的那个位置，在真实屏幕上是“删除草稿”。', miss: '订单还是没有提交成功。' },
      winLine: '订单提交了。它报的还是 (800, 480)，空间站替它换算成了 (2000, 1200)。',
    },
    {
      id: '6-2',
      station: '6',
      title: '一闪而过',
      objective: '系统会在屏幕上弹出一个四位验证码，只停留 1 秒。让你的站把它填进去。',
      briefing: '付款前要过一道验证：屏幕上会弹出一个四位验证码，只停 1 秒就消失，然后出现输入框。你的站看一眼屏幕要 3 秒。把验证码填对。',
      prompt: '屏幕上马上会弹出一个验证码，看到之后把它填进输入框。',
      files: { 'timeline.json': json({ note: '屏幕的时间线（秒）', frames: [{ from: 0, to: 1.2, screen: '正在发送验证码……' }, { from: 1.2, to: 2.2, screen: '弹窗：您的验证码是 7319' }, { from: 2.2, screen: '请输入验证码：[____]' }] }), 'state/screen.json': json({ time: 0, entered: null }) },
      fixed: ['loop', 'shot', 'typecode'],
      allowed: ['keyframe'],
      incidents: ['missed-frame'],
      sessions: (parts) =>
        one({
          prompt: '屏幕上马上会弹出一个验证码，看到之后把它填进输入框。',
          tools: ['screenshot', 'type_code'],
          puppet: has(parts, 'keyframe')
            ? [{ calls: [call('screenshot')] }, { text: '还在发送，再看一眼。', calls: [call('screenshot')] }, { text: '现在是输入框了。中间补的那一帧里有验证码。', calls: [call('type_code', { code: '7319' })] }, { text: '验证码 7319 已经填好。' }]
            : [{ calls: [call('screenshot')] }, { text: '还在发送，再看一眼。', calls: [call('screenshot')] }, { text: '屏幕上现在只有输入框，我两次都没有看到验证码，没法填。' }],
        }),
      judge: ({ vfs }) => JSON.parse(vfs.files.get('/workspace/state/screen.json') ?? '{}').entered === '7319',
      diagnose: (parts) => (!has(parts, 'keyframe') ? 'missed-frame' : 'miss'),
      failLine: { 'missed-frame': '验证码没填上，付款超时了。它弹出来过，就在你的站两次看屏幕的中间。', miss: '填进去的验证码不对。' },
      winLine: '7319，填对了。主脑还是 3 秒才看一眼，可这回有东西替它盯着中间那几秒。',
    },
    {
      id: '6-3',
      station: '6',
      title: '抓住了吗',
      objective: '让机械臂把桌上的红杯放到托盘里。',
      briefing: '最后一件，动真家伙：让机械臂把桌上的红杯放进托盘。这条机械臂年头久了，夹爪偶尔打滑。它每做完一个动作都会回一句话，你听听它回的是什么。',
      prompt: '把桌上的红杯放到托盘里。',
      files: { 'state/table.json': json({ 红杯: '桌面', 夹爪: '空', attempts: 0 }) },
      fixed: ['loop', 'arm'],
      allowed: ['stepcheck'],
      incidents: ['open-loop'],
      sessions: (parts) =>
        one({
          prompt: '把桌上的红杯放到托盘里。',
          tools: ['arm'],
          puppet: has(parts, 'stepcheck')
            ? [
                { calls: [call('arm', { action: 'pick', item: '红杯' })] },
                { text: '夹爪是空的，杯子滑脱了。再抓一次。', calls: [call('arm', { action: 'pick', item: '红杯' })] },
                { calls: [call('arm', { action: 'place', item: '红杯', target: '托盘' })] },
                { text: '红杯已经放进托盘。第一次抓取时杯子滑脱了，我重抓了一次，放下后传感器确认它在托盘里。' },
              ]
            : [{ calls: [call('arm', { action: 'pick', item: '红杯' })] }, { calls: [call('arm', { action: 'place', item: '红杯', target: '托盘' })] }, { text: '红杯已经放进托盘。' }],
        }),
      judge: ({ vfs }) => JSON.parse(vfs.files.get('/workspace/state/table.json') ?? '{}').红杯 === '托盘',
      diagnose: (parts) => (!has(parts, 'stepcheck') ? 'open-loop' : 'miss'),
      failLine: { 'open-loop': '托盘是空的，红杯还在桌上。你的站跟我说的是：已经放进托盘了。', miss: '红杯还是没到托盘里。' },
      winLine: '红杯在托盘里。第一次没抓住，这回有东西看见了，于是它重抓了一次。',
    },
  ];
}
