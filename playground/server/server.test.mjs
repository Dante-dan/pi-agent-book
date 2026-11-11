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
