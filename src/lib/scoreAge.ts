// =====================================================
// 年龄评分 - Allen 偏好：AI 行业越年轻越好，最好 95 后
// =====================================================
import type { Candidate, DimensionResult } from '@/types';
import { clamp } from './normalize';

// 年龄 → 分数查表 (按 Allen 2026-06 偏好设定)
const AGE_SCORE_TABLE: Array<{ maxAge: number; score: number; cohort: string }> = [
  { maxAge: 26, score: 100, cohort: '00 后 (≤26)' },
  { maxAge: 27, score: 96,  cohort: '99 后' },
  { maxAge: 28, score: 93,  cohort: '98 后' },
  { maxAge: 29, score: 90,  cohort: '97 后' },
  { maxAge: 30, score: 88,  cohort: '96 后' },
  { maxAge: 31, score: 85,  cohort: '95 后 (理想区间)' },
  { maxAge: 32, score: 78,  cohort: '94 后' },
  { maxAge: 33, score: 72,  cohort: '93 后' },
  { maxAge: 34, score: 66,  cohort: '92 后' },
  { maxAge: 35, score: 60,  cohort: '91 后' },
  { maxAge: 36, score: 55,  cohort: '90 后' },
  { maxAge: 37, score: 50,  cohort: '89 后' },
  { maxAge: 38, score: 45,  cohort: '88 后' },
  { maxAge: 39, score: 40,  cohort: '87 后' },
  { maxAge: 40, score: 35,  cohort: '86 后' },
  { maxAge: 41, score: 30,  cohort: '85 后' },
  { maxAge: 42, score: 26,  cohort: '84 后' },
  { maxAge: 45, score: 20,  cohort: '83-81 后' },
  { maxAge: 50, score: 14,  cohort: '80-76 后' },
  { maxAge: 99, score: 8,   cohort: '70 后及更早' },
];

const NEUTRAL_SCORE = 65; // 无年龄线索时的中性分

function ageToScore(age: number): { score: number; cohort: string } {
  for (const row of AGE_SCORE_TABLE) {
    if (age <= row.maxAge) return { score: row.score, cohort: row.cohort };
  }
  return { score: 8, cohort: '70 后及更早' };
}

// 从 totalYears 反推出生年 (假设 22 岁开始第一份工作/实习)
function inferBirthYearFromYears(totalYears: number, now = new Date()): number | null {
  if (!totalYears || totalYears < 0) return null;
  const careerStartYear = now.getFullYear() - totalYears;
  return careerStartYear - 22;
}

// 从最高学历入学年反推 (本科 18 岁入学，硕士 22，博士 26)
function inferBirthYearFromEducation(edu: Candidate['education']): number | null {
  if (!edu || edu.length === 0) return null;
  // 找最高学历 (博士 > 硕士 > 本科)
  const order: Record<string, number> = { '博士': 3, '硕士': 2, '本科': 1, '专科': 0, '其他': -1 };
  const sorted = [...edu].sort((a, b) => (order[b.degree] ?? -1) - (order[a.degree] ?? -1));
  const top = sorted[0];
  if (!top?.startYear) return null;

  const enrollAge = top.degree === '博士' ? 24 : top.degree === '硕士' ? 22 : 18;
  return top.startYear - enrollAge;
}

export function scoreAge(candidate: Candidate): DimensionResult {
  const evidence: string[] = [];
  const matched: string[] = [];
  const missed: string[] = [];

  const now = new Date();
  const currentYear = now.getFullYear();

  // 三种来源: 显式 birthYear > 教育反推 > totalYears 反推
  let birthYear: number | null = candidate.birthYear ?? null;
  let source: 'explicit' | 'education' | 'years' | 'unknown' = birthYear ? 'explicit' : 'unknown';

  if (!birthYear) {
    birthYear = inferBirthYearFromEducation(candidate.education);
    if (birthYear) source = 'education';
  }
  if (!birthYear) {
    birthYear = inferBirthYearFromYears(candidate.totalYears, now);
    if (birthYear) source = 'years';
  }

  // 边界检查
  if (birthYear !== null && (birthYear < 1940 || birthYear > currentYear)) {
    birthYear = null;
    source = 'unknown';
  }

  let score: number;
  let cohortLabel: string;
  let age: number | null = null;

  if (birthYear !== null) {
    age = currentYear - birthYear;
    const result = ageToScore(age);
    score = result.score;
    cohortLabel = result.cohort;
    evidence.push(`${birthYear} 年生 (${age} 岁, ${cohortLabel})`);

    if (source === 'explicit') evidence.push('年龄来源：简历直接提取');
    else if (source === 'education') evidence.push('年龄来源：基于最高学历入学年反推');
    else evidence.push('年龄来源：基于工作年限反推 (假设 22 岁开始工作)');

    matched.push(cohortLabel);
  } else {
    score = NEUTRAL_SCORE;
    cohortLabel = '未识别';
    age = null;
    evidence.push('简历中未识别到年龄/出生年信息，给中性分');
    missed.push('出生年份');
  }

  score = clamp(score, 0, 100);

  // 短板
  if (age !== null && age >= 37) {
    missed.push('AI 行业偏好年轻候选人（35 以下加分）');
  } else if (age !== null && age <= 31 && age >= 27) {
    matched.push('95-99 后理想区间');
  }

  let notes: string;
  if (age === null) {
    notes = '候选人年龄未识别，按中性分处理。建议人工核对出生年份以获得更准确评估。';
  } else if (age <= 31) {
    notes = `候选人为${cohortLabel}（${age} 岁），符合 AI 行业偏好年轻候选人的定位，${age <= 26 ? '处于最加分区间' : '在理想区间内'}。`;
  } else if (age <= 36) {
    notes = `候选人为${cohortLabel}（${age} 岁），年龄处于可接受范围，但相比 95 后在 AI 行业偏好上略有不足。`;
  } else if (age <= 42) {
    notes = `候选人为${cohortLabel}（${age} 岁），年龄偏大，与 AI 行业偏好的年轻候选人定位存在差距。`;
  } else {
    notes = `候选人为${cohortLabel}（${age} 岁），年龄显著偏大，AI 行业偏好度低，需重点评估经验深度是否能弥补。`;
  }

  return {
    name: 'age',
    label: '年龄评分',
    score,
    weight: 0.15,
    evidence,
    matched,
    missed,
    notes,
  };
}
