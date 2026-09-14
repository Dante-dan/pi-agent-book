// 从权威 message_end 读取最终消息，避免把流式增量累计多次。
export function gradeEvents(raw) {
  const events = [];
  let invalidLines = 0;
  for (const line of raw.split('\n').filter(line => line.trim())) {
    try {
      const event = JSON.parse(line);
      if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
        invalidLines++;
      } else events.push(event);
    } catch { invalidLines++; }
  }
  const assistants = events.filter(e => e.type === 'message_end' && e.message?.role === 'assistant').map(e => e.message);
  const last = assistants.at(-1);
  const content = last?.content ?? [];
  const finalMessageIndex = events.findLastIndex(e => e.type === 'message_end' && e.message?.role === 'assistant');
  const finalRunEndIndex = events.findLastIndex(e => e.type === 'agent_end');
  const toolOutcomes = new Map(events.filter(e => e.type === 'tool_execution_end').map(e => [e.toolCallId, e]));
  return {
    invalidLines,
    // 旧运行的 agent_end 不能替后续未完成响应背书。
    finished: Boolean(last) && finalRunEndIndex > finalMessageIndex,
    modelError: ['error', 'aborted', 'length'].includes(last?.stopReason),
    outputTruncated: last?.stopReason === 'length',
    finalText: typeof content === 'string' ? content : Array.isArray(content) ? content.filter(c => c?.type === 'text' && typeof c.text === 'string').map(c => c.text).join('\n') : '',
    tools: events.filter(e => e.type === 'tool_execution_start').map(e => {
      const outcome = toolOutcomes.get(e.toolCallId);
      return { name: e.toolName, args: e.args ?? {}, successful: Boolean(outcome) && outcome.isError === false };
    }),
    usage: assistants.map(m => m.usage).filter(Boolean),
  };
}
