// =====================================================
// 候选人信息完整性判定 (Allen 2026-08-21)
//
// 设计原则: 4 个关键信号 (skills / workHistory / currentTitle / totalYears)
//   缺失 ≥ 3 个 → 候选人实质信息不足
//   - 评分侧: 跑公式只会得到噪音低分, 不如 floor 到 50 + 引导补充
//   - 触发侧: UI 应阻止自动评分, 强制用户手动补充
//
// 字段权重:
//   skills (匹配基础) + workHistory (公司/行业判断) + currentTitle (职级) + totalYears (经验)
//   缺少 3 个 → 即使能跑公式, 评分结果也无意义
// =====================================================
import type { Candidate } from '@/types';

export function isCandidateSparse(c: Candidate | null | undefined): boolean {
  if (!c) return true;
  const sparseSignals = [
    !c.skills || c.skills.length === 0,
    !c.workHistory || c.workHistory.length === 0,
    !c.currentTitle,
    !c.totalYears || c.totalYears === 0,
  ];
  return sparseSignals.filter(Boolean).length >= 3;
}

export function getSparseCount(c: Candidate | null | undefined): number {
  if (!c) return 4;
  const sparseSignals = [
    !c.skills || c.skills.length === 0,
    !c.workHistory || c.workHistory.length === 0,
    !c.currentTitle,
    !c.totalYears || c.totalYears === 0,
  ];
  return sparseSignals.filter(Boolean).length;
}
