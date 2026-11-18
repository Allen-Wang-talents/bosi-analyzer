// =====================================================
// 岗位文本结构化 —— 从 JD / 人才画像 里用正则挖硬约束
//
// 为什么单独抽一个模块:
//   飞书里的岗位文本不是规范 JD, 是顾问手写的一段话, 混着「岗位职责/任职要求/画像」。
//   硬约束 (年龄/学历/职级/年限/否定项) 用正则抽出来, 比交给 LLM 便宜且可解释。
//
// 只抽「能在候选人身上验证」的约束 —— 抽不到就是抽不到, 不猜。
// =====================================================

export type DegreeRequirement = '博士' | '硕士' | '本科';

export type JobConstraints = {
  /** 最低年限 (N年以上 / N-M年 区间的下限) */
  minYears: number | null;
  /** 年限上限 (N-M年 区间的上限) */
  maxYears: number | null;
  /** 年龄上限 (如 "30岁以内") */
  maxAge: number | null;
  /** 年龄下限 (如 "25岁以上") */
  minAge: number | null;
  /** 学历门槛 */
  degree: DegreeRequirement | null;
  /** 学校层次 */
  schoolTier: '985' | '211' | '双一流' | null;
  /** 目标职级 (1-7, 与 titleLevel 同一把尺) */
  levelTier: number | null;
  /** 职级原始表述, 用来在卡片上原样展示 */
  levelHint: string | null;
  /** 一票否决项 */
  dealBreakers: string[];
  /** 硬性要求 (原文片段) */
  hardRequirements: string[];
  /** 目标公司背景 */
  companyHints: string[];
  /** 目标行业背景 */
  industryHints: string[];
};

// 字节职级 → 我方 1-7 档位
//   1-1/1-2 初级 → 2;  2-1 中级 → 3;  2-2 高级 → 4
//   3-1 资深 → 4;   3-2 专家 → 5;  4-1/4-2 → 5/6
//   5-x 总监 → 6;   6-x  → 7
const BYTE_LEVEL_TIER: Record<string, number> = {
  '1-1': 2, '1-2': 2,
  '2-1': 3, '2-2': 4,
  '3-1': 4, '3-2': 5,
  '4-1': 5, '4-2': 6,
  '5-1': 6, '5-2': 7,
  '6-1': 7, '6-2': 7,
};

/** 把 "2-1" 这种字节职级换算成 1-7 档位, 不认识就返回 null */
export function byteLevelTier(text: string): number | null {
  const m = /([1-6])\s*[-–~到至]\s*([1-2])/.exec(text);
  if (!m) return null;
  return BYTE_LEVEL_TIER[`${m[1]}-${m[2]}`] ?? null;
}

function pushUnique(list: string[], value: string) {
  const v = value.trim();
  if (!v) return;
  if (!list.includes(v)) list.push(v);
}

/** 从一段文本里抽所有硬约束 */
export function extractConstraints(text: string): JobConstraints {
  const raw = text ?? '';
  const flat = raw.replace(/\r/g, '\n');

  const minYears: number[] = [];
  const maxYears: number[] = [];
  const dealBreakers: string[] = [];
  const hardRequirements: string[] = [];
  const companyHints: string[] = [];
  const industryHints: string[] = [];

  // ---- 年限 ----
  // "3-5年" / "3~5 年" / "3到5年"
  for (const m of flat.matchAll(/(\d+)\s*[-~–到至]\s*(\d+)\s*年/g)) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (lo > 0 && lo <= 40) minYears.push(lo);
    if (hi > 0 && hi <= 40) maxYears.push(hi);
  }
  // "5年以上" / "5年及以上" / "5年+"
  for (const m of flat.matchAll(/(\d+)\s*年\s*(?:及)?以上/g)) {
    const v = Number(m[1]);
    if (v > 0 && v <= 40) minYears.push(v);
  }
  for (const m of flat.matchAll(/至少\s*(\d+)\s*年/g)) {
    const v = Number(m[1]);
    if (v > 0 && v <= 40) minYears.push(v);
  }
  for (const m of flat.matchAll(/(\d+)\s*年\s*\+/g)) {
    const v = Number(m[1]);
    if (v > 0 && v <= 40) minYears.push(v);
  }

  // ---- 年龄 ----
  let maxAge: number | null = null;
  let minAge: number | null = null;
  for (const m of flat.matchAll(/(\d{2})\s*岁\s*(?:以内|以下|之内|之下|封顶)/g)) {
    const v = Number(m[1]);
    if (v >= 18 && v <= 70) maxAge = maxAge === null ? v : Math.min(maxAge, v);
  }
  for (const m of flat.matchAll(/年龄[^0-9]{0,4}(\d{2})\s*[-~–到至]\s*(\d{2})/g)) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (lo >= 18 && lo <= 70) minAge = minAge === null ? lo : Math.max(minAge, lo);
    if (hi >= 18 && hi <= 70) maxAge = maxAge === null ? hi : Math.min(maxAge, hi);
  }
  for (const m of flat.matchAll(/(\d{2})\s*岁\s*(?:以上|起步)/g)) {
    const v = Number(m[1]);
    if (v >= 18 && v <= 70) minAge = minAge === null ? v : Math.max(minAge, v);
  }

  // ---- 学历 ----
  let degree: DegreeRequirement | null = null;
  if (/博士/.test(flat)) degree = '博士';
  else if (/硕士|研究生/.test(flat)) degree = '硕士';
  else if (/本科/.test(flat)) degree = '本科';

  // ---- 学校层次 ----
  let schoolTier: '985' | '211' | '双一流' | null = null;
  if (/985/.test(flat)) schoolTier = '985';
  else if (/211/.test(flat)) schoolTier = '211';
  else if (/双一流/.test(flat)) schoolTier = '双一流';

  // ---- 职级 ----
  let levelTier: number | null = null;
  let levelHint: string | null = null;
  const byteMatch = /对标\s*(?:字节|ByteDance|bytedance)\s*[:：]?\s*([1-6]\s*[-–~到至]\s*[1-2])/i.exec(flat);
  if (byteMatch) {
    levelTier = byteLevelTier(byteMatch[1]);
    levelHint = `对标字节${byteMatch[1].replace(/\s/g, '')}`;
  } else {
    const generic = /对标\s*([A-Za-z一-龥]{2,6})\s*[:：]?\s*([1-9][0-9]?)\s*[-–~到至]\s*([1-9])/i.exec(flat);
    if (generic) {
      levelHint = `对标${generic[1]} ${generic[2]}-${generic[3]}`;
      levelTier = null; // 非字节体系, 数字档位不能直接换算
    } else {
      const pLevel = /\bP([4-9])\b/i.exec(flat);
      if (pLevel) {
        // P4 ≈ 中级, P5 ≈ 资深, P6+ ≈ 专家
        const p = Number(pLevel[1]);
        levelTier = p <= 4 ? 3 : p === 5 ? 4 : p === 6 ? 5 : 6;
        levelHint = `P${p}`;
      }
    }
  }

  // ---- 否定项 ----
  for (const m of flat.matchAll(/(?:不要|不考虑|不接受|排除|拒收)\s*([^，。；;！!？?\n]{2,14})/g)) {
    pushUnique(dealBreakers, m[1]);
  }

  // ---- 硬性要求 ----
  for (const m of flat.matchAll(/(?:一定要会|必须掌握|必须熟悉|必须具备|熟练掌握|精通)\s*([^，。；;！!？?\n]{2,14})/g)) {
    pushUnique(hardRequirements, m[1]);
  }

  // ---- 公司背景 ----
  for (const m of flat.matchAll(/(字节跳动|字节|腾讯|阿里|美团|百度|京东|快手|小红书|滴滴|华为|微软|谷歌|Google|Meta|拼多多|网易|新浪|搜狐|携程|贝壳|小米|OPPO|vivo|大厂|头部公司|一线互联网)/g)) {
    pushUnique(companyHints, m[0]);
  }

  // ---- 行业背景 ----
  for (const m of flat.matchAll(/(游戏|短视频|社交|电商|直播|金融|医疗|教育|出行|支付|广告|内容社区|AI应用|企业服务|智能硬件|机器人|自动驾驶|半导体|生物医药|新能源)/g)) {
    pushUnique(industryHints, m[0]);
  }

  return {
    minYears: minYears.length ? Math.min(...minYears) : null,
    maxYears: maxYears.length ? Math.max(...maxYears) : null,
    maxAge,
    minAge,
    degree,
    schoolTier,
    levelTier,
    levelHint,
    dealBreakers,
    hardRequirements,
    companyHints,
    industryHints,
  };
}

/**
 * 合并两份约束: JD 优先 (JD 是岗位本体), 画像补空。
 * 数值类约束取更严格的一边 (年限取大, 年龄上限取小)。
 */
export function mergeConstraints(jd: JobConstraints, profile: JobConstraints): JobConstraints {
  const maxAge =
    jd.maxAge !== null && profile.maxAge !== null
      ? Math.min(jd.maxAge, profile.maxAge)
      : jd.maxAge ?? profile.maxAge;
  const minAge =
    jd.minAge !== null && profile.minAge !== null
      ? Math.max(jd.minAge, profile.minAge)
      : jd.minAge ?? profile.minAge;
  const minYears =
    jd.minYears !== null && profile.minYears !== null
      ? Math.max(jd.minYears, profile.minYears)
      : jd.minYears ?? profile.minYears;
  const maxYears =
    jd.maxYears !== null && profile.maxYears !== null
      ? Math.min(jd.maxYears, profile.maxYears)
      : jd.maxYears ?? profile.maxYears;

  return {
    minYears,
    maxYears,
    maxAge,
    minAge,
    degree: jd.degree ?? profile.degree,
    schoolTier: jd.schoolTier ?? profile.schoolTier,
    levelTier: jd.levelTier ?? profile.levelTier,
    levelHint: jd.levelHint ?? profile.levelHint,
    dealBreakers: [...jd.dealBreakers, ...profile.dealBreakers].filter(
      (v, i, a) => a.indexOf(v) === i
    ),
    hardRequirements: [...jd.hardRequirements, ...profile.hardRequirements].filter(
      (v, i, a) => a.indexOf(v) === i
    ),
    companyHints: [...jd.companyHints, ...profile.companyHints].filter(
      (v, i, a) => a.indexOf(v) === i
    ),
    industryHints: [...jd.industryHints, ...profile.industryHints].filter(
      (v, i, a) => a.indexOf(v) === i
    ),
  };
}
