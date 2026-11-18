// =====================================================
// 职级匹配
// 从 scoreFit.ts 抽出, 供岗位匹配复用 (岗位画像常写「对标字节 2-1」这类职级要求)
// =====================================================

// 职级层级映射 (高 -> 低)
const LEVEL_MAP: Array<[string, number]> = [
  ['cto', 7], ['ceo', 7], ['vp', 7], ['副总裁', 7],
  ['总监', 6], ['director', 6],
  ['架构师', 5], ['architect', 5], ['tech lead', 5], ['技术负责人', 5],
  ['资深', 4], ['senior', 4], ['高级', 4], ['staff', 4],
  ['leader', 4], ['主管', 4],
  ['中级', 3], ['intermediate', 3],
  ['初级', 2], ['junior', 2],
  ['助理', 1], ['intern', 1], ['实习', 1],
];

/** 从职位名推断职级层级 (1 最低, 7 最高), 未知默认 3 */
export function titleLevel(title: string): number {
  const tl = (title || '').toLowerCase();
  for (const [kw, lvl] of LEVEL_MAP) {
    if (tl.includes(kw.toLowerCase())) return lvl;
  }
  return 3;
}

/**
 * 职级匹配: 0-1 系数
 * 候选人职位 vs 岗位职位, 层级差越大系数越低
 */
export function titleLevelMatch(candidateTitle: string, jdTitle: string, jdLevel?: string): number {
  if (!candidateTitle || !jdTitle) return 0.7; // 信息不足默认中性
  const c = candidateTitle.toLowerCase();
  const j = jdTitle.toLowerCase();

  const cLevel = titleLevel(c);
  const jLevel = jdLevel ? titleLevel(jdLevel) : titleLevel(j);
  return levelMatchByTier(cLevel, jLevel);
}

/**
 * 两档职级之间的匹配系数 (0-1)。
 * 抽出来是因为岗位匹配那边拿到的是数字档位 (画像里的「对标字节2-1」),
 * 没法再转回字符串喂给 titleLevelMatch。
 */
export function levelMatchByTier(cLevel: number, jLevel: number): number {
  const diff = Math.abs(cLevel - jLevel);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.85;
  if (diff === 2) return 0.65;
  if (diff === 3) return 0.45;
  return 0.25;
}
