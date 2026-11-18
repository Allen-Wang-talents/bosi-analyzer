// =====================================================
// 岗位池 - 飞书多维表格「北京AI岗位汇总」的结构与映射
//
// 这个文件被三处共用：
//   - api/jobs.ts          (Vercel Serverless, 运行时读飞书)
//   - scripts/fetch-jobs.ts (本地开发, 用 lark-cli 身份拉同一套数据)
//   - src/                 (前端只消费 JobPosition 类型, 不 import 任何运行时逻辑)
//
// 所以这里只能用相对路径 import, 且不能碰 process.env / node 内置模块。
// =====================================================

/** 岗位方向 —— 对应飞书表格的 8 个分表 */
export type JobTrack =
  | 'product'
  | 'dev'
  | 'algo'
  | 'investment'
  | 'growth'
  | 'design'
  | 'hr'
  | 'legal';

export const JOB_TRACKS: JobTrack[] = [
  'product',
  'dev',
  'algo',
  'investment',
  'growth',
  'design',
  'hr',
  'legal',
];

export const TRACK_LABEL: Record<JobTrack, string> = {
  product: '产品岗',
  dev: '开发岗',
  algo: '算法岗',
  investment: '投资岗',
  growth: '增长岗',
  design: '设计师',
  hr: 'HR岗',
  legal: '财法务',
};

/** 多维表格 app_token —— 「北京AI岗位汇总」整张表共用一个 base */
export const FEISHU_BASE_APP_TOKEN = 'Shzwbd2SYaOi9Ksm6VlcktFvnzb';

/** 8 个分表 → base 里的 8 张数据表 */
export const FEISHU_TABLES: Array<{ track: JobTrack; tableId: string }> = [
  { track: 'product', tableId: 'tblLz5Rjq20618DR' },
  { track: 'dev', tableId: 'tblM1BnN9zhsFaut' },
  { track: 'algo', tableId: 'tblfBWCUSRlMetDX' },
  { track: 'investment', tableId: 'tbl65DJcFjfzImS4' },
  { track: 'growth', tableId: 'tblWPps77TEjBmXh' },
  { track: 'design', tableId: 'tblqkPENz7Ybw8Sh' },
  { track: 'hr', tableId: 'tbl7uvGGb9hECWdB' },
  { track: 'legal', tableId: 'tbl3e5wOCc4LX7iW' },
];

/** 只拉需要的字段 —— 企业概况/父记录 这类大 blob 不要拖下来 */
export const FEISHU_FIELD_NAMES = [
  '客户',
  '职位名称',
  'JD',
  '人才画像',
  '地址',
  '薪资带宽',
  '合同点位',
  '客户层级',
  '优先级',
  '客户经理',
  '开始时间',
  '备注',
] as const;

/** 岗位（一个在招职位） */
export type JobPosition = {
  id: string;
  track: JobTrack;
  trackLabel: string;
  client: string;
  title: string;
  location: string;
  jdText: string;
  profileText: string;
  salaryBand: string;
  feePoint: string;
  clientTier: string;
  priority: string;
  owner: string;
  startDate: string;
  remarks: string;
};

/** 飞书字段值 → 纯文本 */
export function fieldText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(fieldText).filter(Boolean).join(' / ');
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const picked = o.text ?? o.name ?? o.en_name ?? o.value ?? o.full_name;
    return picked == null ? '' : fieldText(picked);
  }
  return '';
}

/** 飞书 datetime 是毫秒时间戳 */
export function fieldDate(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const picked = o.value ?? o.timestamp ?? o.text;
    return picked == null ? '' : fieldDate(picked);
  }
  const s = fieldText(value);
  // 已经是 ISO 串就取日期部分, 否则原样返回
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
}

/** 一条飞书记录 → JobPosition */
export function mapRecord(track: JobTrack, raw: Record<string, unknown>): JobPosition {
  const id = fieldText(raw.record_id) || fieldText(raw.id);
  return {
    id,
    track,
    trackLabel: TRACK_LABEL[track],
    client: fieldText(raw['客户']),
    title: fieldText(raw['职位名称']),
    location: fieldText(raw['地址']),
    jdText: fieldText(raw['JD']),
    profileText: fieldText(raw['人才画像']),
    salaryBand: fieldText(raw['薪资带宽']),
    feePoint: fieldText(raw['合同点位']),
    clientTier: fieldText(raw['客户层级']),
    priority: fieldText(raw['优先级']),
    owner: fieldText(raw['客户经理']),
    startDate: fieldDate(raw['开始时间']),
    remarks: fieldText(raw['备注']),
  };
}

/** 已停止 / 暂停的岗位默认不进推荐 */
export function isPaused(job: JobPosition): boolean {
  return /暂停|停止|关闭|已下线/.test(job.priority);
}
