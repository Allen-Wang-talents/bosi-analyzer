// =====================================================
// 关键词 / 短语匹配工具
// =====================================================
import { normalize, similarity, clamp } from './normalize';
import type { SchoolTier, CompanyTier } from '@/types';

// 在文本中查找关键词命中 (normalized substring match)
export function findMatches(text: string, keywords: string[]): string[] {
  if (!text || !keywords.length) return [];
  const norm = normalize(text);
  const matched: string[] = [];
  for (const kw of keywords) {
    if (!kw) continue;
    if (norm.includes(normalize(kw))) matched.push(kw);
  }
  return matched;
}

// 检查文本是否命中任一关键词
export function hasAny(text: string, keywords: string[]): boolean {
  return findMatches(text, keywords).length > 0;
}

// 给定一组 tier 配置，从文本中查找匹配的实体并返回 (实体 -> tier)
export function buildEntityTierMap(
  text: string,
  tiers: Array<{ tier: number; items: string[] }>
): Map<string, number> {
  const map = new Map<string, number>();
  if (!text) return map;
  const norm = normalize(text);

  for (const { tier, items } of tiers) {
    for (const item of items) {
      if (!item) continue;
      const ni = normalize(item);
      if (ni && norm.includes(ni)) {
        // 长匹配优先
        const existing = map.get(item);
        if (existing === undefined || tier < existing) {
          map.set(item, tier);
        }
      }
    }
  }
  return map;
}

// 在候选人工作经历中查找每段对应公司 tier (匹配最长)
export function resolveCompanyTiers(
  companyNames: string[],
  tiers: CompanyTier[]
): Map<string, number> {
  const result = new Map<string, number>();
  const entityMap = new Map<string, number>();

  for (const tier of tiers) {
    for (const company of tier.companies) {
      entityMap.set(company, tier.tier);
    }
  }

  // 对每个候选人公司，找最长匹配的 tier 表中的公司
  for (const candidateCompany of companyNames) {
    if (!candidateCompany) continue;
    const normCandidate = normalize(candidateCompany);
    let bestMatch: { name: string; tier: number; len: number } | null = null;

    for (const [entity, tier] of entityMap.entries()) {
      const normEntity = normalize(entity);
      if (normCandidate.includes(normEntity)) {
        if (!bestMatch || normEntity.length > bestMatch.len) {
          bestMatch = { name: entity, tier, len: normEntity.length };
        }
      }
    }

    if (bestMatch) {
      result.set(candidateCompany, bestMatch.tier);
    } else {
      result.set(candidateCompany, 8); // 其他/未识别
    }
  }
  return result;
}

// 在候选人学校中查找每个对应 tier
export function resolveSchoolTiers(
  schoolNames: string[],
  tiers: SchoolTier[]
): Map<string, number> {
  const result = new Map<string, number>();
  const entityMap = new Map<string, number>();

  for (const tier of tiers) {
    for (const school of tier.schools) {
      entityMap.set(school, tier.tier);
    }
  }

  for (const candidateSchool of schoolNames) {
    if (!candidateSchool) continue;
    const normCandidate = normalize(candidateSchool);
    if (normCandidate.length < 2) {
      result.set(candidateSchool, 9);
      continue;
    }

    let bestFull: { name: string; tier: number } | null = null; // candidate.includes(entity)
    let bestPartial: { name: string; tier: number; ratio: number } | null = null; // entity.includes(candidate)

    for (const [entity, tier] of entityMap.entries()) {
      const normEntity = normalize(entity);
      if (!normEntity || normEntity.length < 2) continue;

      if (normCandidate.includes(normEntity)) {
        // 完整包含: 简历写了全名. 倾向更长(更具体)的 entity, 优先级高于简称
        if (!bestFull || normEntity.length > normalize(bestFull.name).length) {
          bestFull = { name: entity, tier };
        }
      } else if (normEntity.includes(normCandidate)) {
        // 部分匹配: 简历写了简称. 选 candidate 覆盖率最高的(即 entity 较短/最接近 candidate 的)
        const ratio = normCandidate.length / normEntity.length;
        if (
          !bestPartial ||
          ratio > bestPartial.ratio ||
          (ratio === bestPartial.ratio && tier < bestPartial.tier)
        ) {
          bestPartial = { name: entity, tier, ratio };
        }
      }
    }

    // 优先返回完整包含, 否则返回最长简称匹配
    if (bestFull) {
      result.set(candidateSchool, bestFull.tier);
    } else if (bestPartial) {
      result.set(candidateSchool, bestPartial.tier);
    } else {
      result.set(candidateSchool, 9);
    }
  }
  return result;
}

// 综合匹配评分 (0-1)
export function matchRatio(text: string, keywords: string[]): number {
  if (!keywords.length) return 0;
  const matched = findMatches(text, keywords);
  return clamp(matched.length / keywords.length, 0, 1);
}

// 相似度匹配 (Levenshtein) - 处理拼写差异
export function fuzzyFind(text: string, keyword: string, threshold = 0.85): boolean {
  if (!text || !keyword) return false;
  const norm = normalize(text);
  const normKw = normalize(keyword);
  if (norm.includes(normKw)) return true;

  // 检查每个 word 是否与 keyword 相似
  const words = norm.split(/[\s,;.]+/);
  for (const w of words) {
    if (w.length < 3 || normKw.length < 3) continue;
    if (similarity(w, normKw) >= threshold) return true;
  }
  return false;
}