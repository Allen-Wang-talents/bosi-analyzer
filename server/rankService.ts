// =====================================================
// 岗位精排 —— Vercel 和 Netlify 两套部署共用这一份
//
// 只管「问模型 + 解析结果」, 不碰 req/res。
//
// 保密边界 (硬性):
//   - 候选人不发 rawText / 联系方式 / 生日
//   - 岗位不发 合同点位 / 预计收费 / 薪资带宽 / 客户层级 —— 这些跟人岗契合无关,
//     发了模型会顺手按薪资排, 顾问没法解释
// =====================================================
import { parseRankItems, type RankItem } from '../shared/rankParse.ts';
import { callMiniMax, upstreamMessage, UpstreamError, DEFAULT_MODEL, type ChatMessage } from './minimax.ts';

export const MAX_TOKENS = 8000;
export const BATCH_SIZE = 10;

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

export type RankPayload = {
  results: RankItem[];
  degraded: boolean;
  error?: string;
};

const SYSTEM_PROMPT = `你是资深猎头顾问, 正在从一批在招岗位里, 为一位候选人挑出最值得推荐给客户的岗位, 并写出推荐理由。

判断标准只有一条: 人岗契合度。
不要评价薪资高低、客户层级、合同点位 —— 那些不是你的判断范围。

输出要求:
- 只输出一个 JSON 数组, 不要任何解释文字、不要 markdown 代码块
- 数组每个元素形如 {"id": "岗位id", "score": 87, "reason": "60-120字", "gaps": ["差距"]}
- score 是 0-100 的整数, 表示你对这个岗位的推荐信心
- reason 必须做到两件事: (a) 说明为什么匹配, 要引用岗位描述里的原词; (b) 点出一个差距或风险
- gaps 写具体的差距 (例如「没有多模态经验」「未体现过万卡集群训练」), 没有就写空数组
- 必须为输入里的每一个岗位都输出一项, id 必须原样照抄`;

/**
 * 候选人简介裁剪 —— 前端传什么都要能扛住。
 *
 * 简历里技能可能有几百条、项目几十个, 原样拼进 prompt 会把 token 预算吃光,
 * 模型输出就被截断 (而截断 = JSON 解析失败 = 白花钱)。这里按上限裁。
 */
function sanitizeCandidate(c: CandidateBrief): CandidateBrief {
  const str = (v: unknown, max: number): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

  return {
    title: str(c.title, 80),
    company: str(c.company, 80),
    years: typeof c.years === 'number' && Number.isFinite(c.years) ? c.years : undefined,
    age: typeof c.age === 'number' && Number.isFinite(c.age) ? c.age : null,
    skills: Array.isArray(c.skills)
      ? c.skills.filter((s): s is string => typeof s === 'string').map((s) => s.slice(0, 40)).slice(0, 60)
      : [],
    education: Array.isArray(c.education)
      ? c.education.slice(0, 10).map((e) => ({
          school: str(e?.school, 60),
          degree: str(e?.degree, 20),
          major: str(e?.major, 40),
        }))
      : [],
    work: Array.isArray(c.work)
      ? c.work.slice(0, 20).map((w) => ({
          company: str(w?.company, 60),
          title: str(w?.title, 60),
          highlights: Array.isArray(w?.highlights)
            ? w.highlights.filter((h): h is string => typeof h === 'string').map((h) => h.slice(0, 120)).slice(0, 8)
            : [],
        }))
      : [],
    projects: Array.isArray(c.projects)
      ? c.projects.slice(0, 20).map((p) => ({
          name: str(p?.name, 80),
          description: str(p?.description, 300),
        }))
      : [],
  };
}

function buildUserPrompt(candidate: CandidateBrief, jobs: JobBrief[]): string {
  const c = {
    当前职位: candidate.title ?? '未提供',
    当前公司: candidate.company ?? '未提供',
    工作年限: candidate.years ?? 0,
    年龄: candidate.age ?? null,
    技能: candidate.skills ?? [],
    教育: candidate.education ?? [],
    工作经历: candidate.work ?? [],
    项目: candidate.projects ?? [],
  };

  const j = jobs.map((job, i) => ({
    序号: i + 1,
    id: job.id,
    职位名称: job.title ?? '',
    客户: job.client ?? '',
    方向: job.track ?? '',
    地点: job.location ?? '',
    岗位JD: (job.jd ?? '').slice(0, 1500),
    人才画像: (job.profile ?? '').slice(0, 800),
  }));

  return `候选人信息:\n${JSON.stringify(c, null, 2)}\n\n岗位列表:\n${JSON.stringify(j, null, 2)}\n\n请输出 JSON 数组。`;
}

async function callMiniMaxRank(
  apiKey: string,
  candidate: CandidateBrief,
  jobs: JobBrief[],
): Promise<{ items: RankItem[]; finishReason: string | null }> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(candidate, jobs) },
  ];
  const result = await callMiniMax({
    apiKey,
    messages,
    maxTokens: MAX_TOKENS,
    temperature: 0.3,
    model: DEFAULT_MODEL,
  });
  return { items: parseRankItems(result.content), finishReason: result.finishReason };
}

/**
 * 精排一批岗位。
 * 一次问不下 (被截断 / JSON 解析失败) 就对半分再问, 最多拆两轮。
 */
async function rankBatch(
  apiKey: string,
  candidate: CandidateBrief,
  jobs: JobBrief[],
  depth = 0,
): Promise<RankItem[]> {
  const { items, finishReason } = await callMiniMaxRank(apiKey, candidate, jobs);

  const truncated = finishReason === 'length';
  if (items.length === 0 && (truncated || jobs.length > 1) && depth < 2) {
    const mid = Math.ceil(jobs.length / 2);
    const [a, b] = [jobs.slice(0, mid), jobs.slice(mid)];
    const left = await rankBatch(apiKey, candidate, a, depth + 1);
    const right = await rankBatch(apiKey, candidate, b, depth + 1);
    return [...left, ...right];
  }

  return items;
}

/** 精排入口 —— 失败也返回结果, 由调用方决定怎么降级 */
export async function rankJobs(opts: {
  apiKey: string;
  candidate?: CandidateBrief;
  jobs?: JobBrief[];
}): Promise<RankPayload> {
  const { apiKey, candidate, jobs } = opts;
  const list = Array.isArray(jobs) ? jobs : [];

  if (!candidate || !list.length) {
    return { results: [], degraded: true, error: '请求缺少 candidate 或 jobs' };
  }
  if (list.length > BATCH_SIZE) {
    return { results: [], degraded: true, error: `一次最多精排 ${BATCH_SIZE} 个岗位` };
  }

  try {
    const results = await rankBatch(apiKey, sanitizeCandidate(candidate), list);
    // 模型少返回了岗位 (reason/gaps 都空的那条会被 parseRankItems 丢掉) ——
    // 记一笔, 前端要知道自己只拿到了一部分
    if (results.length < list.length) {
      console.warn(`[rank] 模型只返回了 ${results.length}/${list.length} 个岗位的结论`);
    }
    return { results, degraded: false };
  } catch (err) {
    // 上游的原始报错里带着上游返回的内容, 别原样吐给前端
    const message =
      err instanceof UpstreamError
        ? upstreamMessage(err.status)
        : err instanceof Error
          ? err.message
          : String(err);
    console.error('[rank] 精排失败:', err);
    return { results: [], degraded: true, error: message };
  }
}
