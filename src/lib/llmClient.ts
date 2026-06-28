// =====================================================
// LLM 客户端 - MiniMax M3 (OpenAI 兼容格式)
// =====================================================
import type { ScoreResult, Company, JD, JobProfile, Candidate } from '@/types';
import { serializeForLLM } from './formatReport';

const SYSTEM_PROMPT = `你是博思人才评荐网的 AI 助手，服务于资深猎头顾问。你将收到一份结构化的候选人匹配分析数据，包括公司信息、岗位 JD、岗位画像、候选人简历解析、以及 4 个维度的评分与依据。

请基于这些数据回答顾问的问题。回答要求：
1. 使用中文，专业猎头口吻，简洁有力
2. 必须引用具体数据（分数、匹配项、缺失项、公司名、学校名等）
3. 不超过 250 字，除非顾问明确要求展开
4. 不要编造分析中不存在的事实，遇到信息不足时坦诚说明
5. 如果顾问问的是建议类问题，给出明确观点（推荐 / 谨慎 / 不推荐）+ 依据
6. 适当使用换行增强可读性`;

const API_URL = 'https://api.minimaxi.com/v1/chat/completions';
const DEFAULT_MODEL = 'MiniMax-M3';

export type ApiKeyGetter = () => string | null;

let keyGetter: ApiKeyGetter = () => null;

export function setApiKeyGetter(fn: ApiKeyGetter) {
  keyGetter = fn;
}

export class ApiKeyMissingError extends Error {
  constructor() {
    super('请先在设置中配置 MiniMax M3 API Key');
    this.name = 'ApiKeyMissingError';
  }
}

function getKey(): string {
  const key = keyGetter();
  if (!key) throw new ApiKeyMissingError();
  return key;
}

// OpenAI 兼容响应格式
type ChatCompletionResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type AskContext = {
  analysis: ScoreResult;
  company?: Company | null;
  jd?: JD | null;
  profile?: JobProfile | null;
  candidate?: Candidate | null;
};

export async function askAboutAnalysis(question: string, ctx: AskContext): Promise<string> {
  const apiKey = getKey();
  const userPrompt = buildUserPrompt(question, ctx);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 800,
      temperature: 0.5,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let msg = `API ${response.status}: ${errText || response.statusText}`;
    if (response.status === 401) msg = 'API Key 无效或已过期，请检查设置';
    else if (response.status === 429) msg = '请求过于频繁，请稍后再试';
    else if (response.status === 402) msg = '账户余额不足，请充值';
    throw new Error(msg);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const choice = data.choices?.[0];
  const rawContent = choice?.message?.content?.trim() ?? '';
  return stripThinkingTags(rawContent);
}

// 去除 <think>...</think> 推理块（MiniMax M3 特性）
function stripThinkingTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .trim();
}

function buildUserPrompt(question: string, ctx: AskContext): string {
  const parts: string[] = [];

  parts.push('# 当前分析上下文');
  parts.push('');

  if (ctx.company) {
    parts.push(`## 客户公司\n${ctx.company.name} · ${ctx.company.industry} · ${ctx.company.size}人 · ${ctx.company.stage}\n主营: ${ctx.company.business}\n产品: ${ctx.company.products}`);
    parts.push('');
  }

  if (ctx.jd) {
    parts.push(`## 岗位 JD\n职位: ${ctx.jd.title}\n地点: ${ctx.jd.location || '未指定'}\n经验要求: ${ctx.jd.minYears}+ 年\n薪资: ${ctx.jd.compRange ? `${ctx.jd.compRange.min/1000}K-${ctx.jd.compRange.max/1000}K` : '未指定'}\n行业: ${ctx.jd.industry || '未指定'}`);
    parts.push(`必须技能: ${ctx.jd.mustHaveSkills.join('、') || '无'}`);
    parts.push(`加分技能: ${ctx.jd.niceToHaveSkills.join('、') || '无'}`);
    if (ctx.jd.responsibilities.length > 0) {
      parts.push(`主要职责:\n${ctx.jd.responsibilities.slice(0, 6).map((r) => `  - ${r}`).join('\n')}`);
    }
    parts.push('');
  }

  if (ctx.profile) {
    parts.push(`## 顾问补充画像`);
    if (ctx.profile.dealBreakers.length) parts.push(`一票否决: ${ctx.profile.dealBreakers.join('、')}`);
    if (ctx.profile.niceToHaves.length) parts.push(`加分项: ${ctx.profile.niceToHaves.join('、')}`);
    if (ctx.profile.culturalFit) parts.push(`文化契合: ${ctx.profile.culturalFit}`);
    if (ctx.profile.targetCompanyTiers.length) parts.push(`目标公司 tier: ${ctx.profile.targetCompanyTiers.join(', ')}`);
    parts.push('');
  }

  if (ctx.candidate) {
    parts.push(`## 候选人`);
    if (ctx.candidate.name) parts.push(`姓名: ${ctx.candidate.name}`);
    if (ctx.candidate.currentTitle) parts.push(`当前职位: ${ctx.candidate.currentTitle}${ctx.candidate.currentCompany ? ' @ ' + ctx.candidate.currentCompany : ''}`);
    parts.push(`工作年限: ${ctx.candidate.totalYears.toFixed(1)} 年`);
    if (ctx.candidate.skills.length) parts.push(`技能: ${ctx.candidate.skills.slice(0, 15).join('、')}`);

    if (ctx.candidate.education.length > 0) {
      parts.push(`教育:`);
      ctx.candidate.education.slice(0, 3).forEach((e) => {
        parts.push(`  - ${e.school} · ${e.degree}${e.major ? ' · ' + e.major : ''}${e.schoolTier ? ` (Tier ${e.schoolTier})` : ''}`);
      });
    }

    if (ctx.candidate.workHistory.length > 0) {
      parts.push(`工作经历:`);
      ctx.candidate.workHistory.slice(0, 4).forEach((w) => {
        parts.push(`  - ${w.company}${w.companyTier ? ` (Tier ${w.companyTier})` : ''} · ${w.title} · ${w.startYear}-${w.endYear ?? '至今'} (${(w.durationMonths / 12).toFixed(1)}年)`);
      });
    }
    parts.push('');
  }

  parts.push(serializeForLLM(ctx.analysis));

  parts.push('');
  parts.push('# 顾问的问题');
  parts.push(question);

  return parts.join('\n');
}

// 验证 API Key（轻量级 ping）
export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    return response.ok;
  } catch (e) {
    console.error('API Key 验证失败:', e);
    return false;
  }
}