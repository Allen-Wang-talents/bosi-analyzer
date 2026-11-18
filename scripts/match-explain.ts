// =====================================================
// 匹配结果诊断 (调词表和权重时用)
//
//   node scripts/match-explain.ts --resume /tmp/简历.txt
//   node scripts/match-explain.ts --candidate /tmp/candidate.json --top 15
//   node scripts/match-explain.ts --resume r.txt --explain <岗位id>
//
// 走 vite 的 SSR 加载器, 所以 src/ 里的 '@/' 别名能正常解析。
// 简历用本地解析 (parseResumeText), 不调 LLM —— 诊断要的是可重复的结果。
// =====================================================
import { createServer } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Candidate } from '../src/types/index.ts';
import type { JobPosition } from '../shared/jobs.ts';

// src/lib 里的模块是浏览器代码 (用 DOM API + bundler 式导入), 不能被 node 的
// tsconfig 拉进来 —— 所以这里只写用得到的结构, 不 import 它们的类型。
type Dim = { label: string; score: number | null };
type Result = {
  job: JobPosition;
  score: number;
  dimensions: Dim[];
  matchedTerms: string[];
  missingTerms: string[];
  violations: string[];
  priorityBonus: number;
  confidence: number;
};

function arg(name: string, dflt = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const jobsPath = resolve(arg('jobs', 'data/jobs.snapshot.json'));
const topN = Number(arg('top', '10'));
const explainId = arg('explain', '');

if (!existsSync(jobsPath)) {
  console.error(`岗位池不存在: ${jobsPath}\n先跑 node scripts/fetch-jobs.ts`);
  process.exit(1);
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });

try {
  const { matchAllJobs, selectTopMatches, buildContext } = await vite.ssrLoadModule(
    '/src/lib/jobMatch.ts'
  );
  const { parseResumeText } = await vite.ssrLoadModule('/src/lib/parseResume.ts');

  let candidate: Candidate;
  const candidatePath = arg('candidate', '');
  if (candidatePath) {
    candidate = JSON.parse(readFileSync(candidatePath, 'utf-8'));
  } else {
    const resumePath = arg('resume', '');
    if (!resumePath) {
      console.error('要 --resume <文件> 或 --candidate <json>');
      process.exit(1);
    }
    candidate = parseResumeText(readFileSync(resumePath, 'utf-8'));
  }

  const jobs = JSON.parse(readFileSync(jobsPath, 'utf-8')) as JobPosition[];
  const results: Result[] = matchAllJobs(candidate, jobs);
  const top: Result[] = selectTopMatches(results, topN);

  console.log(
    `候选人: ${candidate.name ?? '(未命名)'} · ${candidate.totalYears ?? '?'} 年 · ${candidate.currentTitle ?? '?'}`
  );
  console.log(
    `技能: ${(candidate.skills ?? []).slice(0, 14).join(' / ') || '(无)'}`
  );
  console.log(`岗位池: ${jobs.length} 个 → 参与排序 ${results.length} 个\n`);

  const ctx = buildContext(candidate, jobs);
  const affinities = Object.entries(ctx.affinities as Record<string, number>)
    .map(([k, v]) => `${k}:${(v * 100).toFixed(0)}%`)
    .join('  ');
  console.log(`方向亲和度: ${affinities}\n`);

  console.log('排名  分数  岗位'.padEnd(58) + ' 维度拆解');
  console.log('─'.repeat(120));
  top.forEach((r: Result, i: number) => {
    const dims = r.dimensions
      .map((d: Dim) => `${d.label.split('与')[0].slice(0, 4)}${d.score === null ? '—' : Math.round(d.score)}`)
      .join(' ');
    const head = `#${i + 1}`.padEnd(5);
    const score = String(Math.round(r.score)).padEnd(6);
    const name = `${r.job.title || '(无标题)'} @ ${r.job.client || '?'}`.slice(0, 46);
    console.log(`${head}${score}${name.padEnd(48)}${dims}`);
  });

  if (explainId) {
    const r = results.find((x: Result) => x.job.id === explainId);
    if (!r) {
      console.error(`\n没找到岗位 ${explainId}`);
    } else {
      console.log(`\n${'═'.repeat(70)}\n${r.job.title} @ ${r.job.client}  (${r.job.id})`);
      console.log(`总分 ${r.score.toFixed(1)}  置信度 ${r.confidence.toFixed(2)}  优先级加分 ${r.priorityBonus}`);
      console.log(`\n命中: ${r.matchedTerms.join(' / ') || '(无)'}`);
      console.log(`未命中: ${r.missingTerms.join(' / ') || '(无)'}`);
      if (r.violations.length) console.log(`硬性冲突: ${r.violations.join(' / ')}`);
      console.log(`\n${r.job.jdText || '(无 JD)'}`);
      console.log(`\n--- 人才画像 ---\n${r.job.profileText || '(无画像)'}`);
    }
  }
} finally {
  await vite.close();
}
