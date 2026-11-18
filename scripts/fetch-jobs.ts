// =====================================================
// 本地拉岗位 (不走 Vercel, 不用飞书应用凭证)
//
//   node scripts/fetch-jobs.ts                       # 用 lark-cli 用户身份拉, 写到 data/jobs.snapshot.json
//   node scripts/fetch-jobs.ts --out /tmp/jobs.json
//   node scripts/fetch-jobs.ts --source=file <目录>  # 读离线 ndjson 导出 (目录里是 "<分表名>.ndjson")
//
// lark-cli 以「用户身份」调用, 走的是本人授权, 不需要给应用申请 base:record:read。
// 线上 (Vercel) 走应用凭证, 见 server/feishu.ts。
// =====================================================
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  FEISHU_BASE_APP_TOKEN,
  FEISHU_TABLES,
  TRACK_LABEL,
  mapRecord,
  type JobPosition,
  type JobTrack,
} from '../shared/jobs.ts';

const LARK_CLI =
  process.env.LARK_CLI ||
  join(homedir(), '.workbuddy/binaries/node/cli-connector-packages/bin/lark-cli');

function arg(name: string, dflt = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const source = arg('source', 'cli');
const outFile = arg('out', 'data/jobs.snapshot.json');
const baseAppToken = arg('base-token', FEISHU_BASE_APP_TOKEN);

function parseNdjson(path: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try {
      out.push(JSON.parse(s) as Record<string, unknown>);
    } catch {
      /* 跳过坏行 */
    }
  }
  return out;
}

/** 用 lark-cli 以用户身份拉一张表 */
function pullViaCli(tableId: string): Array<Record<string, unknown>> {
  const tmp = join('/tmp', `bosi-jobs-${tableId}.ndjson`);
  execFileSync(
    LARK_CLI,
    [
      'base',
      '+record-list',
      '--base-token',
      baseAppToken,
      '--table-id',
      tableId,
      '--limit',
      '2000',
      '--as',
      'user',
      '--format',
      'ndjson',
      '--output',
      tmp,
      '--overwrite',
    ],
    { encoding: 'utf-8', stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return parseNdjson(tmp);
}

/** 读离线导出目录: 文件名是中文分表名 */
function pullFromDir(dir: string): Array<{ track: JobTrack; rows: Array<Record<string, unknown>> }> {
  const labelToTrack = new Map<string, JobTrack>(
    (Object.keys(TRACK_LABEL) as JobTrack[]).map((t) => [TRACK_LABEL[t], t]),
  );
  const out: Array<{ track: JobTrack; rows: Array<Record<string, unknown>> }> = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.ndjson')) continue;
    const label = file.replace(/\.ndjson$/, '');
    const track = labelToTrack.get(label);
    if (!track) continue;
    out.push({ track, rows: parseNdjson(join(dir, file)) });
  }
  return out;
}

async function main(): Promise<void> {
  const jobs: JobPosition[] = [];

  if (source === 'file') {
    const dir = arg('dir');
    if (!dir || !existsSync(dir)) {
      console.error('用法: node scripts/fetch-jobs.ts --source=file <目录>');
      process.exit(1);
    }
    for (const { track, rows } of pullFromDir(dir)) {
      jobs.push(...rows.map((raw) => mapRecord(track, raw)));
    }
  } else {
    const results = await Promise.all(
      FEISHU_TABLES.map(async ({ track, tableId }) => {
        const rows = pullViaCli(tableId);
        return rows.map((raw) => mapRecord(track, raw));
      }),
    );
    jobs.push(...results.flat());
  }

  const byTrack = new Map<string, number>();
  for (const j of jobs) byTrack.set(j.trackLabel, (byTrack.get(j.trackLabel) ?? 0) + 1);

  writeFileSync(outFile, JSON.stringify(jobs, null, 2), 'utf-8');
  console.log(`已写入 ${outFile}`);
  console.log(`岗位总数: ${jobs.length}`);
  for (const [label, n] of byTrack) console.log(`  ${label}: ${n}`);
}

await main();
