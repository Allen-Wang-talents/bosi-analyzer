// =====================================================
// 评分结果文本格式化 - 严格按 Allen 范例输出
// =====================================================
import type { ScoreResult } from '@/types';

export function formatReport(result: ScoreResult): string {
  const lines: string[] = [];

  // 第一行: 综合评分 X 分（档位）
  lines.push(`综合评分 ${result.total.toFixed(1)} 分（${result.recommendation.label}）`);
  lines.push('');

  // 评分依据
  lines.push('评分依据：');
  result.dimensions.forEach((d, idx) => {
    lines.push(`${idx + 1}. ${d.label} ${d.score.toFixed(0)} 分`);
  });
  lines.push('');

  // 履历分析
  lines.push('履历分析：');
  lines.push(result.summary);

  return lines.join('\n');
}

// 给 LLM 用：结构化序列化
export function serializeForLLM(result: ScoreResult): string {
  const parts: string[] = [];

  parts.push(`## 综合评分`);
  parts.push(`总分: ${result.total.toFixed(1)} / 100`);
  parts.push(`推荐档位: ${result.recommendation.label} (${result.recommendation.tier})`);
  parts.push(`理由: ${result.recommendation.reason}`);
  parts.push('');

  parts.push(`## 评分依据（4 维度）`);
  for (const d of result.dimensions) {
    parts.push(`### ${d.label} - ${d.score.toFixed(0)} 分 (权重 ${(d.weight * 100).toFixed(0)}%)`);
    if (d.notes) parts.push(`点评: ${d.notes}`);
    if (d.evidence.length > 0) parts.push(`依据:\n${d.evidence.map((e) => `  - ${e}`).join('\n')}`);
    if (d.matched.length > 0) parts.push(`已匹配: ${d.matched.slice(0, 10).join('、')}`);
    if (d.missed.length > 0) parts.push(`未命中: ${d.missed.slice(0, 10).join('、')}`);
    parts.push('');
  }

  parts.push(`## 履历分析摘要`);
  parts.push(result.summary);

  return parts.join('\n');
}