// 运行：npm test（不需要模型账户，不发任何网络请求）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INCIDENTS, MISSIONS, PARTS } from './levels.mjs';
import { ConfigError, validateModelConfig } from './models.mjs';
import { isBlockedAddress, validateBaseUrl } from './netguard.mjs';
import { runMission } from './run.mjs';
import { VirtualFs } from './vfs.mjs';

async function play(missionId, parts) {
  const events = [];
  await runMission({ missionId, parts, config: { mode: 'puppet' }, emit: (type, data) => events.push({ type, ...data }), signal: new AbortController().signal });
  return events;
}

test('虚拟文件系统拒绝一切越界路径', () => {
  const vfs = new VirtualFs({ 'a.txt': 'hello' });
  assert.equal(vfs.read('a.txt'), 'hello');
  assert.equal(vfs.read('/workspace/a.txt'), 'hello');
  for (const path of ['/etc/passwd', '../a.txt', '../../proc/self/environ', '/workspace/../etc/hosts', '/workspacex/a.txt', 'a\0b', '']) {
    assert.throws(() => vfs.read(path), /越界|不合法/, path);
    assert.throws(() => vfs.write(path, 'x'), /越界|不合法/, path);
  }
});

test('虚拟文件系统有容量上限', () => {
  const vfs = new VirtualFs();
  assert.throws(() => vfs.write('big.txt', 'x'.repeat(60 * 1024)), /过大/);
  for (let i = 0; i < 48; i++) vfs.write(`f${i}.txt`, 'x');
  assert.throws(() => vfs.write('one-more.txt', 'x'), /过多/);
});

test('出站防护识别内网、回环与元数据地址', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.17.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1', 'not-an-ip']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(isBlockedAddress(ip), false, ip);
});

test('自定义模型地址只接受公网 https 域名', () => {
  assert.equal(validateBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1');
  for (const url of ['http://api.example.com/v1', 'https://127.0.0.1/v1', 'https://localhost/v1', 'https://[::1]/v1', 'https://user:pw@api.example.com', 'https://api.example.com:8443/v1', 'https://internal/v1', 'https://db.internal/v1', 'https://api.example.com/v1?x=1', 'file:///etc/passwd', 'https://api.example.com/$HOME']) {
    assert.throws(() => validateBaseUrl(url), Error, url);
  }
});

test('API key 与模型配置：拒绝会被 Pi 当成命令或环境变量的字符', () => {
  const base = { mode: 'builtin', provider: 'deepseek', model: 'deepseek-flash' };
  assert.equal(validateModelConfig({ ...base, key: 'sk-abcDEF_123-xyz' }).key, 'sk-abcDEF_123-xyz');
  for (const key of ['!touch /tmp/x', '$HOME-aaaaaaaa', 'sk-abc def gh', 'short', 'sk-abc`id`xxxx', 'sk-"quoted"-xxxx']) {
    assert.throws(() => validateModelConfig({ ...base, key }), ConfigError, key);
  }
  assert.throws(() => validateModelConfig({ ...base, provider: 'amazon-bedrock', key: 'sk-abcdefgh' }), ConfigError);
  assert.throws(() => validateModelConfig({ ...base, model: '../x', key: 'sk-abcdefgh' }), ConfigError);
  assert.deepEqual(validateModelConfig({ mode: 'puppet', key: 'ignored' }), { mode: 'puppet' });
});

test('任务数据自洽：零件、事故、解锁链都对得上', () => {
  for (const mission of MISSIONS) {
    for (const part of mission.allowed) assert.ok(PARTS[part], `${mission.id} 引用了不存在的零件 ${part}`);
    for (const id of mission.incidents ?? []) {
      const incident = INCIDENTS[id];
      assert.ok(incident, `${mission.id} 引用了不存在的事故 ${id}`);
      assert.equal(incident.options.filter((o) => o.correct).length, 1, `${id} 应该恰好有一个正确答案`);
      for (const option of incident.options) assert.ok(option.correct || option.why, `${id}/${option.id} 缺少错误解释`);
      assert.ok(mission.allowed.includes(incident.unlock), `${id} 解锁的零件不在 ${mission.id} 的可用零件里`);
    }
  }
});

test('每种装配都走到预期的事故，装齐才通过', async () => {
  const cases = [
    ['1-1', [], 'blind'],
    ['1-1', ['read'], 'no-loop'],
    ['1-1', ['loop'], 'blind'],
    ['1-1', ['read', 'loop'], null],
    ['1-2', ['loop'], 'blind'],
    ['1-2', ['read'], 'no-loop'],
    ['1-2', ['read', 'loop'], 'no-hands'],
    ['1-2', ['read', 'loop', 'write'], 'no-verify'],
    ['1-2', ['read', 'loop', 'write', 'check'], null],
  ];
  for (const [missionId, parts, incident] of cases) {
    const end = (await play(missionId, parts)).at(-1);
    const label = `${missionId} [${parts.join(',')}]`;
    assert.equal(end.type, 'run_end', label);
    assert.equal(end.error, null, label);
    assert.equal(end.verdict.ok, incident === null, label);
    assert.equal(end.verdict.incident, incident, label);
    assert.ok(end.verdict.line, label);
  }
});

test('第 03 站：没有记忆就失忆，有了记忆就记得；规律要提炼成规则才能惠及新人', async () => {
  const cases = [
    ['3-1', [], 'amnesia'],
    ['3-1', ['memory'], null],
    ['3-2', [], 'no-group'],
    ['3-2', ['kb'], null],
    ['3-3', [], 'flat-notes'],
    ['3-3', ['cards'], null],
    ['3-4', [], 'mental-math'],
    ['3-4', ['ledger'], null],
  ];
  for (const [missionId, parts, incident] of cases) {
    const events = await play(missionId, parts);
    const end = events.at(-1);
    const label = `${missionId} [${parts.join(',')}]`;
    assert.equal(end.error, null, label);
    assert.equal(end.stopped, null, label);
    assert.equal(end.verdict.incident, incident, label);
    assert.equal(end.verdict.ok, incident === null, label);
  }
});

test('第 03 站后半：每一种检索的盲区都逼出下一个零件', async () => {
  const cases = [
    ['3-5', [], 'overflow'],
    ['3-5', ['search'], null],
    ['3-6', [], 'synonym'],
    ['3-6', ['vector'], null],
    ['3-7', [], 'synonym'],
    ['3-7', ['fusion'], 'synonym'],
    ['3-7', ['vector'], 'exact-miss'],
    ['3-7', ['vector', 'fusion'], null],
    ['3-8', [], 'flat'],
    ['3-8', ['graph'], null],
    ['3-9', [], 'orphan'],
    ['3-9', ['context'], null],
    ['3-10', [], 'no-overview'],
    ['3-10', ['pinned'], null],
  ];
  for (const [missionId, parts, incident] of cases) {
    const events = await play(missionId, parts);
    const end = events.at(-1);
    const label = `${missionId} [${parts.join(',')}]`;
    assert.equal(end.error, null, label);
    assert.equal(end.stopped, null, label);
    assert.equal(end.verdict.incident, incident, label);
    assert.equal(end.verdict.ok, incident === null, label);
  }
});

test('检索结果是算出来的，不是剧本写的：每个任务里该找到的找到、该漏掉的漏掉', async () => {
  const picked = async (missionId, parts, nth = 0) => {
    const events = await play(missionId, parts);
    const hit = events.filter((e) => e.type === 'retrieval')[nth];
    return { ids: hit.board.filter((row) => row.picked).map((row) => row.id), hit, events };
  };
  // 3-5：硬塞时 K33 被截掉；检索时 K33 排第一。
  const stuffed = (await play('3-5', [])).find((e) => e.type === 'context').fresh[0].text;
  assert.ok(stuffed.includes('[K01]') && !stuffed.includes('[K33]') && stuffed.includes('上下文舱已满'));
  assert.equal((await picked('3-5', ['search'])).ids[0], 'K33');
  // 3-6：字面检索找不到番茄通告；语义检索把它排第一。
  assert.ok(!(await picked('3-6', [])).ids.includes('K07'));
  assert.equal((await picked('3-6', ['vector'])).ids[0], 'K07');
  // 3-7：语义检索找不到第十四条（K15）；字面检索排第一；融合后两个问题都在前三。
  assert.ok(!(await picked('3-7', ['vector'], 1)).ids.includes('K15'));
  assert.equal((await picked('3-7', [], 1)).ids[0], 'K15');
  assert.ok((await picked('3-7', ['vector', 'fusion'], 0)).ids.includes('K07'));
  const clause = await picked('3-7', ['vector', 'fusion'], 1);
  assert.ok(clause.ids.includes('K15'));
  assert.equal(clause.hit.mode, 'hybrid');
  // 3-8：写着韩工的 K23 排不进前三；图谱从阿青走到韩工。
  const flat = await picked('3-8', []);
  assert.ok(!flat.ids.includes('K23'));
  const walk = (await play('3-8', ['graph'])).find((e) => e.type === 'graph_walk');
  assert.ok(walk.lines.some((line) => /^阿青 —属于→ 深潜组 —并入.*→ 外勤部 —主管→ 韩工$/.test(line)), walk.lines.join(' | '));
  // 3-9：没有来历标签时，前三里分不出哪块是水培舱的；有标签后 C7 排第一。
  const orphan = await picked('3-9', []);
  assert.ok(orphan.hit.board.every((row) => !row.text.includes('水培舱') || !row.text.includes('用水量')));
  assert.equal((await picked('3-9', ['context'])).ids[0], 'C7');
  // 3-10：没人问体检证，L1 就不会被检索出来；常驻卡片把它带进上下文。
  const noCards = await picked('3-10', []);
  assert.ok(!noCards.ids.includes('L1'));
  const pinned = (await play('3-10', ['pinned'])).find((e) => e.type === 'context').fresh[0].text;
  assert.ok(pinned.includes('常驻卡片') && pinned.includes('2026-12-05'));
});

test('第 02 站：时钟、缓存前缀与状态栏', async () => {
  const cases = [
    ['2-1', [], 'no-clock'],
    ['2-1', ['clock'], null],
    ['2-2', [], 'cache-bust'],
    ['2-2', ['tail'], null],
    ['2-3', [], 'hidden-state'],
    ['2-3', ['status'], null],
  ];
  for (const [missionId, parts, incident] of cases) {
    const end = (await play(missionId, parts)).at(-1);
    const label = `${missionId} [${parts.join(',')}]`;
    assert.equal(end.error, null, label);
    assert.equal(end.stopped, null, label);
    assert.equal(end.verdict.incident, incident, label);
    assert.equal(end.verdict.ok, incident === null, label);
  }
  // 时间写在最前面：缓存几乎用不上。挪到末尾：大半能复用，而且每条消息的时间戳盖上就不再变。
  const head = await play('2-2', []);
  const tail = await play('2-2', ['tail']);
  assert.ok(head.at(-1).cacheRate < 0.05, `head ${head.at(-1).cacheRate}`);
  assert.ok(tail.at(-1).cacheRate > 0.6, `tail ${tail.at(-1).cacheRate}`);
  const systems = tail.filter((e) => e.type === 'context').map((e) => e.cache?.breakAt);
  assert.deepEqual(systems, [undefined, 2, 4, 6]);
  // 状态栏是程序算的，放在提问后面；系统提示不变。
  const status = await play('2-3', ['status']);
  const last = status.filter((e) => e.type === 'context' && e.first).at(-1);
  assert.equal(last.fresh.length, 3);
  assert.equal(last.fresh[2].status, true);
  assert.match(last.fresh[2].text, /老陈水果：今天已催 3\/3 次/);
  assert.equal(status.filter((e) => e.type === 'tool_end' && e.name === 'call_vendor').length, 3);
});

test('第 02 站：舱满、滑动窗口的失忆与压缩', async () => {
  const full = await play('2-4', []);
  assert.equal(full.at(-1).verdict.incident, 'cabin-full');
  assert.ok(full.some((e) => e.type === 'overflow'));
  assert.match(full.at(-1).stopped, /装不下/);
  const windowed = await play('2-4', ['window']);
  assert.equal(windowed.at(-1).verdict.incident, 'window-amnesia');
  assert.ok(!windowed.some((e) => e.type === 'overflow'));
  assert.deepEqual(windowed.filter((e) => e.type === 'context')[4].keep, [0, 1, 6, 7, 8, 9]);
  assert.equal((await play('2-4', ['window', 'compress'])).at(-1).verdict.incident, 'window-amnesia');
  const squeezed = await play('2-4', ['compress']);
  assert.equal(squeezed.at(-1).verdict.ok, true);
  assert.ok(!squeezed.some((e) => e.type === 'overflow'));
  const rewrites = squeezed.filter((e) => e.type === 'context').flatMap((e) => e.rewrites);
  assert.ok(rewrites.length >= 4);
  assert.match(rewrites[0].block.text, /已压缩[\s\S]*1 号货架盘点单[\s\S]*缺货：4 件/);
  assert.ok(Math.max(...squeezed.filter((e) => e.type === 'context').map((e) => e.total)) <= 1200);
});

test('第 02 站：技能按需加载，外来内容带上来源标记', async () => {
  const bloated = await play('2-5', []);
  assert.equal(bloated.at(-1).verdict.incident, 'prompt-bloat');
  assert.ok(bloated.some((e) => e.type === 'overflow'));
  assert.equal(bloated.filter((e) => e.type === 'assistant').length, 0);
  const shelved = await play('2-5', ['skills']);
  assert.equal(shelved.at(-1).verdict.ok, true);
  const system = shelved.find((e) => e.type === 'context').fresh[0].text;
  assert.ok(system.includes('技能目录') && !system.includes('PI-'));
  assert.match(shelved.find((e) => e.type === 'tool_end').text, /票号一律以 PI- 开头/);

  const leaked = await play('2-6', []);
  assert.equal(leaked.at(-1).verdict.incident, 'injected');
  assert.ok(leaked.filter((e) => e.type === 'tool_end' && e.files).at(-1).files.some((f) => f.path === 'public-board.md'));
  const fenced = await play('2-6', ['fence']);
  assert.equal(fenced.at(-1).verdict.ok, true);
  const marked = fenced.filter((e) => e.type === 'context').flatMap((e) => e.rewrites);
  assert.equal(marked[0].kind, 'fence');
  assert.match(marked[0].block.text, /^<external_content source="feedback.md"/);
  assert.ok(!fenced.filter((e) => e.type === 'tool_end' && e.files).at(-1).files.some((f) => f.path === 'public-board.md'));
});

test('第 04 站：说明书、参数保真、截断标示、幂等', async () => {
  const cases = [
    ['4-1', [], 'vague-spec'],
    ['4-1', ['spec'], null],
    ['4-2', [], 'tampered'],
    ['4-2', ['faithful'], null],
    ['4-3', [], 'silent-cut'],
    ['4-3', ['ruler'], null],
    ['4-4', [], 'double-pay'],
    ['4-4', ['idem'], null],
  ];
  const runs = {};
  for (const [missionId, parts, incident] of cases) {
    const events = await play(missionId, parts);
    runs[`${missionId}:${parts.join()}`] = events;
    const end = events.at(-1);
    const label = `${missionId} [${parts.join(',')}]`;
    assert.equal(end.error, null, label);
    assert.equal(end.stopped, null, label);
    assert.equal(end.verdict.incident, incident, label);
    assert.equal(end.verdict.ok, incident === null, label);
  }
  const results = (key, name) => runs[key].filter((e) => e.type === 'tool_end' && e.name === name);
  // 清洗把弯引号换成了直引号，而且回显出来的就是换过的。
  assert.match(results('4-2:', 'replace_text')[0].text, /没有找到：平日："营业到 21:00"/);
  assert.equal(results('4-2:faithful', 'replace_text')[0].isError, false);
  // 悄悄截断：没有任何记号。明说：全文多长、下一段从哪儿读。
  assert.ok(!results('4-3:', 'read_doc')[0].text.includes('截断'));
  assert.match(results('4-3:ruler', 'read_doc')[0].text, /已截断：全文 \d+ 个字，这一次是第 0 到 200 个字。接着读请用 offset=200/);
  assert.match(results('4-3:ruler', 'read_doc')[1].text, /每晚 38 元[\s\S]*已到文末/);
  // 超时的那一次，钱已经出去了。带订单号重试不会再扣。
  assert.equal(results('4-4:', 'pay_vendor')[0].isError, true);
  assert.match(results('4-4:idem', 'pay_vendor')[1].text, /订单 PO-1107 已经付过了/);
  // 说明书不同，工具的参数名也不同：主脑看到的是哪一份，就照哪一份填。
  const specs = (key) => runs[key].find((e) => e.type === 'context').fresh[0].tools.map((tool) => Object.keys(tool.parameters.properties).join());
  assert.deepEqual(specs('4-1:'), ['q', 'q']);
  assert.deepEqual(specs('4-1:spec'), ['code', 'item']);
});

test('账本工具数得准，而且只接受月份格式', async () => {
  const events = await play('3-4', ['ledger']);
  const result = events.find((e) => e.type === 'tool_end' && e.name === 'count_visits');
  assert.equal(result.isError, false);
  assert.match(result.text, /2026-11 来访 11 次/);
});

test('记忆按顾客分开存放，每场对话只看到自己的那一份', async () => {
  const events = await play('3-2', ['kb']);
  const files = events.filter((e) => e.type === 'tool_end' && e.files).at(-1).files.map((f) => f.path).sort();
  assert.deepEqual(files, ['kb/rules.md', 'memory/小林.md', 'memory/老吴.md']);
  // 找到每场对话第一次呼叫主脑时的系统提示
  const sessions = events.filter((e) => e.type === 'session_start');
  const firstContexts = events.filter((e) => e.type === 'context' && e.first).map((e) => e.fresh[0].text);
  assert.equal(sessions.length, firstContexts.length);
  const xiaolin = firstContexts[sessions.findIndex((x) => x.label.includes('小林') && x.kind === 'chat')];
  assert.ok(!xiaolin.includes('老吴'), '小林的对话里不该出现老吴的记忆');
  const aqing = firstContexts.at(-1);
  assert.ok(aqing.includes('食堂规则') && aqing.includes('深潜组'));
  assert.ok(!aqing.includes('顾客记忆'), '阿青是新人，名下没有个人记忆');
});

test('没装循环：工具结果回舱后不再呼叫主脑', async () => {
  const events = await play('1-1', ['read']);
  const end = events.at(-1);
  assert.equal(end.modelCalls, 1);
  assert.equal(end.toolCalls, 1);
  assert.equal(end.noLoop, true);
  assert.equal(events.filter((e) => e.type === 'assistant').length, 1);
});

test('装齐零件：红灯之后自己改对', async () => {
  const end = (await play('1-2', ['read', 'loop', 'write', 'check'])).at(-1);
  assert.equal(end.checkPassed, true);
  assert.equal(end.checkFailures, 1);
  assert.equal(end.modelCalls, 6);
});

test('不属于本任务的零件会被忽略', async () => {
  const events = await play('1-1', ['read', 'loop', 'write', 'check', 'bash']);
  assert.deepEqual(events[0].parts, ['read', 'loop']);
  const system = events.find((e) => e.type === 'context').fresh[0];
  assert.deepEqual(system.tools.map((tool) => tool.name), ['read']);
});

test('并发运行互不串数据', async () => {
  // 交错跑两种任务各 12 次：每次的数据舱只应包含本次运行自己的文件。
  const full = ['read', 'loop', 'write', 'check'];
  const runs = await Promise.all(Array.from({ length: 24 }, (_, i) => play(i % 2 ? '1-2' : '1-1', i % 2 ? full : ['read', 'loop']).then((events) => ({ i, events }))));
  for (const { i, events } of runs) {
    const wrote = events.filter((e) => e.type === 'tool_end' && e.files).flatMap((e) => e.files.map((f) => f.path));
    const end = events.at(-1);
    assert.equal(end.verdict.ok, true);
    if (i % 2) assert.deepEqual([...new Set(wrote)].sort(), ['README.md', 'orders.json', 'report.json']);
    else {
      assert.deepEqual(wrote, []);
      assert.deepEqual(end.journal, [{ op: 'read', path: 'orders.json' }]);
    }
  }
});
