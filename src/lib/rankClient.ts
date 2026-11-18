// =====================================================
// 岗位精排客户端 (调 /api/rank)
//
// 这里的「简报」是保密边界所在:
//   - 候选人不发 rawText / 联系方式 / 生日 (只发年龄, 画像里的年龄硬约束要靠它)
//   - 岗位不发 合同点位 / 预计收费 / 薪资带宽 / 客户层级
//     —— 那些跟人岗契合无关, 发了模型会顺手按薪资排, 顾问没法解释
// =====================================================
import type { Candidate } from '@/types';
import type { JobMatchResult } from './jobMatch';
import { estimateAge } from './ageUtil';
import type { RankItem } from '../../shared/rankParse.ts';

export type { RankItem };

export type CandidateBrief = {
  title?: string;
  company?: string;
  years?: number;
  age?: number | null;
  skills?: string[];
  education?: Array<{ school?: string; degree?: string; major?: string }>;
  work?: Array<{ company?: string; title?: string; highlights?: string[] }>;
  projects?: Array<{ name?: string; description?: string }>;
};

export type JobBrief = {
  id: string;
  title?: string;
  client?: string;
  track?: string;
  location?: string;
  jd?: string;
  profile?: string;
};

/** 候选人 → 给 LLM 看的简报 */
export function buildCandidateBrief(candidate: Candidate): CandidateBrief {
  const age = estimateAge(candidate);
  return {
    title: candidate.currentTitle,
    company: candidate.currentCompany,
    years: candidate.totalYears,
    age,
    skills: (candidate.skills ?? []).slice(0, 40),
    education: (candidate.education ?? []).slice(0, 4).map((e) => ({
      school: e.school,
      degree: e.degree,
      major: e.major,
    })),
    work: (candidate.workHistory ?? []).slice(0, 5).map((w) => ({
      company: w.company,
      title: w.title,
      highlights: (w.description ?? '').split(/[。；;\n]/).filter(Boolean).slice(0, 4),
    })),
    projects: (candidate.projects ?? []).slice(0, 4).map((p) => ({
      name: p.name,
      description: (p.description ?? '').slice(0, 300),
    })),
  };
}

/** 岗位 → 给 LLM 看的简报 (注意: 这里没有 feePoint / salaryBand / clientTier) */
export function buildJobBriefs(results: JobMatchResult[]): JobBrief[] {
  return results.map((r) => ({
    id: r.job.id,
    title: r.job.title,
    client: r.job.client,
    track: r.job.trackLabel,
    location: r.job.location,
    jd: r.job.jdText,
    profile: r.job.profileText,
  }));
}

/**
 * 调 /api/rank 精排。
 * 永远不抛 —— 失败返回空结果 + degraded, 让 UI 保留本地排序。
 */
export async function rankJobs(
  candidate: Candidate,
  results: JobMatchResult[]
): Promise<{ items: RankItem[]; degraded: boolean; error?: string }> {
  if (!results.length) return { items: [], degraded: false };

  try {
    const res = await fetch('/api/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate: buildCandidateBrief(candidate),
        jobs: buildJobBriefs(results),
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      results?: RankItem[];
      degraded?: boolean;
      error?: string;
    };

    return {
      items: Array.isArray(data.results) ? data.results : [],
      degraded: Boolean(data.degraded),
      error: data.error,
    };
  } catch (e) {
    return {
      items: [],
      degraded: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
