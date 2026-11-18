// =====================================================
// 精排结果解析 —— 从模型输出里挖 JSON 数组
//
// 放 shared/ 是因为 api/rank.ts (服务端) 和单测都要用。
// 模型不保证输出干净的 JSON, 这里做防御性解析:
//   - <think> 推理块
//   - ```json 代码围栏
//   - 数组前后夹带的废话
//   - 被截断导致括号不闭合 (直接返回空, 由调用方决定要不要分批重问)
// =====================================================

export type RankItem = {
  id: string;
  score: number;
  reason: string;
  gaps: string[];
};

export function stripThinkingTags(text: string): string {
  return text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/g, '').trim();
}

/**
 * 解析模型输出。
 * 任何一项不合法就丢掉那一项, 不影响其它项; 一个都解析不出来才返回空数组。
 */
export function parseRankItems(content: string): RankItem[] {
  if (!content) return [];
  let text = stripThinkingTags(content);

  // 剥 ```json 围栏
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  // 取第一个 [ 到最后一个 ]
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  const slice = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return [];
  }

  const arr = Array.isArray(parsed)
    ? parsed
    : (parsed as { results?: unknown })?.results;

  if (!Array.isArray(arr)) return [];

  const out: RankItem[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) continue;
    const score = typeof item.score === 'number' && Number.isFinite(item.score)
      ? Math.max(0, Math.min(100, Math.round(item.score)))
      : 0;
    const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
    const gaps = Array.isArray(item.gaps)
      ? item.gaps
          .filter((g): g is string => typeof g === 'string')
          .map((g) => g.trim())
          .filter(Boolean)
      : [];
    if (!reason && !gaps.length) continue;
    out.push({ id, score, reason, gaps });
  }
  return out;
}
