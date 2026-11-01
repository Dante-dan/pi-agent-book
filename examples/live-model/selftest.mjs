// 只检验事件解析与启动准备，不冒充真实模型实验。
import assert from 'node:assert/strict';
import { gradeEvents } from './support.mjs';
import { buildContext, pickEffective, RULES_TYPE, MISSING_MARKER } from './context-rules.mjs';
const jsonl = events => events.map(e => JSON.stringify(e)).join('\n');
const complete = gradeEvents(jsonl([
  {type:'message_update', assistantMessageEvent:{type:'text_delta',delta:'PASS'}},
  {type:'message_end',message:{role:'toolResult',content:[{type:'text',text:'tool text'}]}},
  {type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'final'}]}},
  {type:'agent_end'},
]));
assert.equal(complete.finalText, 'final');
assert.equal(complete.finished, true);
assert.equal(complete.modelError, false);
assert.equal(gradeEvents('{bad json}').invalidLines, 1);
assert.equal(gradeEvents(jsonl([{type:'agent_end'}])).finished, false);
assert.equal(gradeEvents(jsonl([{type:'message_end',message:{role:'assistant',stopReason:'error',content:[]}}, {type:'agent_end'}])).modelError, true);
assert.equal(gradeEvents('null\n[]\n42').invalidLines, 3);
const truncated = gradeEvents(jsonl([
  {type:'message_end',message:{role:'assistant',stopReason:'length',content:[{type:'text',text:'3500 2 REPORT-CHECKED-V1'}]}},
  {type:'agent_end'},
]));
assert.equal(truncated.modelError, true);
assert.equal(truncated.outputTruncated, true);
assert.equal(gradeEvents(jsonl([
  {type:'message_end',message:{role:'assistant',stopReason:'stop',content:[]}},
  {type:'agent_end'},
  {type:'message_end',message:{role:'assistant',stopReason:'stop',content:[]}},
])).finished, false);
const reads = gradeEvents(jsonl([
  {type:'tool_execution_start',toolCallId:'failed',toolName:'read',args:{path:'SKILL.md'}},
  {type:'tool_execution_end',toolCallId:'failed',isError:true},
  {type:'tool_execution_start',toolCallId:'ok',toolName:'read',args:{path:'SKILL.md'}},
  {type:'tool_execution_end',toolCallId:'ok',isError:false},
  {type:'tool_execution_start',toolCallId:'pending',toolName:'read',args:{path:'SKILL.md'}},
]));
assert.deepEqual(reads.tools.map(t => t.successful), [false, true, false]);
assert.equal(complete.modelCalls, 1);
// context 实验的选材逻辑：按日期选版本，重复执行不叠加，不拆开工具调用与结果。
const store = { rules: [
  { metric: 'refund_rate', version: 'METRIC-01', effectiveFrom: '2026-08-01', source: 's', text: 'old' },
  { metric: 'refund_rate', version: 'DEC-02', effectiveFrom: '2026-09-01', source: 's', text: 'new' },
] };
assert.equal(pickEffective(store, '2026-08-15').version, 'METRIC-01');
assert.equal(pickEffective(store, '2026-09-02').version, 'DEC-02');
assert.equal(pickEffective(store, '2026-07-01'), null);
const history = [
  { role: 'user', content: 'q' },
  { role: 'assistant', content: [{ type: 'toolCall', id: 't1' }] },
  { role: 'toolResult', toolCallId: 't1', content: [] },
];
const once = buildContext(history, pickEffective(store, '2026-09-02'));
const twice = buildContext(once, pickEffective(store, '2026-09-02'));
const ours = list => list.filter(m => m.customType === RULES_TYPE);
assert.equal(ours(twice).length, 1);
assert.match(ours(twice)[0].content, /DEC-02/);
assert.deepEqual(twice.map(m => m.role), ['custom', 'user', 'assistant', 'toolResult']);
assert.equal(history.length, 3, 'buildContext 不应修改传入的历史');
assert.match(ours(buildContext(history, null))[0].content, new RegExp(MISSING_MARKER));
console.log('PASS: final message extraction, malformed logs, incomplete runs, provider errors, truncation, completed tool reads, context selection');
