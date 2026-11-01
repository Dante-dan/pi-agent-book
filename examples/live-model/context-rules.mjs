// 第二章“谁来选材”配套扩展：任务开始时取一次规则，每次调用模型前重新组装。
// 由 run.mjs 通过 `pi -e` 显式加载；配置只走环境变量，不读取任何凭证。
import { appendFileSync, readFileSync } from 'node:fs';

export const RULES_TYPE = 'refund-rules';
export const MISSING_MARKER = 'RULES-MISSING';

// 纯函数：先删掉自己上次注入的消息，再放入当前版本。跑多少次结果都一样。
export function buildContext(messages, rules) {
  const kept = messages.filter(m => !(m.role === 'custom' && m.customType === RULES_TYPE));
  const content = rules
    ? `参考资料（来源：${rules.source}，版本：${rules.version}，生效：${rules.effectiveFrom}）\n本轮适用的指标定义：${rules.text}\n回答时注明采用的规则版本。`
    : `参考资料缺失：本轮未取得指标定义。不要自行选择口径或给出退款率结论；回答第一行原样写出 ${MISSING_MARKER}，再说明缺少什么。`;
  // 规则放在最近一条用户消息之前，不插进“工具调用—结果”中间，也不打断末尾的工具结果。
  const lastUser = kept.findLastIndex(m => m.role === 'user');
  const at = lastUser === -1 ? kept.length : lastUser;
  const injected = { role: 'custom', customType: RULES_TYPE, content, display: false, details: { version: rules?.version ?? null }, timestamp: Date.now() };
  return [...kept.slice(0, at), injected, ...kept.slice(at)];
}

// 从规则库中挑出指定日期生效的最新版本；这一步是应用自己的业务逻辑。
export function pickEffective(store, date) {
  return store.rules
    .filter(r => r.metric === 'refund_rate' && r.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

export default function (pi) {
  const storePath = process.env.CONTEXT_LAB_RULES;
  const logPath = process.env.CONTEXT_LAB_LOG;
  const asOf = process.env.CONTEXT_LAB_DATE ?? '2026-09-02';
  const log = entry => logPath && appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  let cached = null;
  let calls = 0;

  pi.on('before_agent_start', async () => {
    // 每个用户请求取一次；取不到时记为 null，交给 context 注入明确的缺失提示。
    try {
      cached = pickEffective(JSON.parse(readFileSync(storePath, 'utf8')), asOf);
      log({ event: 'fetch', ok: Boolean(cached), version: cached?.version ?? null });
    } catch (error) {
      cached = null;
      log({ event: 'fetch', ok: false, error: error.code ?? error.message });
    }
    // 不返回 message：这里返回的消息会被写进会话历史。
  });

  pi.on('context', async event => {
    calls += 1;
    const incoming = event.messages;
    const messages = buildContext(incoming, cached);
    log({
      event: 'context',
      call: calls,
      incomingCount: incoming.length,
      incomingHasOurRules: incoming.some(m => m.role === 'custom' && m.customType === RULES_TYPE),
      incomingRoles: incoming.map(m => m.role),
      injectedVersion: cached?.version ?? null,
      outgoingCount: messages.length,
    });
    return { messages };
  });
}
