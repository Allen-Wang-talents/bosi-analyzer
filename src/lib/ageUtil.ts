// =====================================================
// 年龄推算工具
// 从 scoreAge.ts 抽出, 供岗位匹配复用 (岗位画像里常写「30岁以内」这类硬约束)
// =====================================================
import type { Candidate } from '@/types';

// 从 totalYears 反推出生年 (假设 22 岁开始第一份工作/实习)
export function inferBirthYearFromYears(totalYears: number, now = new Date()): number | null {
  if (!totalYears || totalYears < 0) return null;
  const careerStartYear = now.getFullYear() - totalYears;
  return careerStartYear - 22;
}

// 从最高学历入学年反推 (本科 18 岁入学，硕士 22，博士 26)
export function inferBirthYearFromEducation(edu: Candidate['education']): number | null {
  if (!edu || edu.length === 0) return null;
  // 找最高学历 (博士 > 硕士 > 本科)
  const order: Record<string, number> = { '博士': 3, '硕士': 2, '本科': 1, '专科': 0, '其他': -1 };
  const sorted = [...edu].sort((a, b) => (order[b.degree] ?? -1) - (order[a.degree] ?? -1));
  const top = sorted[0];
  if (!top?.startYear) return null;

  const enrollAge = top.degree === '博士' ? 24 : top.degree === '硕士' ? 22 : 18;
  return top.startYear - enrollAge;
}

/** 候选人年龄 (取不到返回 null) */
export function estimateAge(candidate: Candidate, now = new Date()): number | null {
  const currentYear = now.getFullYear();
  let birthYear: number | null = candidate.birthYear ?? null;

  if (!birthYear) birthYear = inferBirthYearFromEducation(candidate.education);
  if (!birthYear) birthYear = inferBirthYearFromYears(candidate.totalYears, now);

  if (birthYear !== null && (birthYear < 1940 || birthYear > currentYear)) return null;
  return birthYear === null ? null : currentYear - birthYear;
}
