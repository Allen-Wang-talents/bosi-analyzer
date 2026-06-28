// =====================================================
// 文本规范化 - 简历/JD 字段匹配前的预处理
// =====================================================

export function normalize(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    // 全角 -> 半角
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    )
    // 中文标点统一
    .replace(/[，]/g, ',')
    .replace(/[。]/g, '.')
    .replace(/[；]/g, ';')
    .replace(/[：]/g, ':')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    // 多余空白
    .replace(/\s+/g, ' ')
    .trim();
}

// 提取文本中的所有整数
export function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

// 计算两个日期之间的月数 (粗略)
export function monthsBetween(startYear: number, endYear: number | null, now = new Date()): number {
  const end = endYear ?? now.getFullYear();
  return Math.max(0, (end - startYear) * 12);
}

// 计算数组交集
export function intersection<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

// 计算数组差集 (a - b)
export function difference<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((x) => !setB.has(x));
}

// 计算 Jaccard 相似度
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  return intersection(a, b).length / new Set([...a, ...b]).size;
}

// 数字限制在 [min, max]
export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

// 简单 fuzzy match - 文本中是否包含关键词 (case-insensitive, normalized)
export function contains(text: string, keyword: string): boolean {
  if (!text || !keyword) return false;
  return normalize(text).includes(normalize(keyword));
}

// 计算字符串相似度 (Levenshtein 距离归一化)
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;

  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// 时间长度（年）格式化
export function formatYears(years: number): string {
  if (years < 1) return `${Math.round(years * 12)} 个月`;
  return `${years.toFixed(1)} 年`;
}