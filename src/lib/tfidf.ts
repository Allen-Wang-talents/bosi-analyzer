// =====================================================
// 字符二元组 TF-IDF —— 中文短文本相似度
//
// 为什么不用分词库:
//   岗位文本和简历都是中文短文本, 装了分词器也多切不准 (「推理优化」会被切碎)。
//   字符二元组 (bigram) 对中文短文本效果接近词级, 且零依赖。
//
// 为什么不用余弦以外的:
//   余弦对长度不敏感, 岗位文本长短差异大 (有的 50 字, 有的 800 字), 余弦刚好归一掉长度。
// =====================================================

/** 文本 → token 序列: ASCII 词整体保留, 中文切二元组 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const re = /[a-z][a-z0-9+#._-]*|[一-鿿]+/g;
  for (const m of lower.matchAll(re)) {
    const chunk = m[0];
    if (/^[a-z]/.test(chunk)) {
      tokens.push(chunk);
    } else if (chunk.length === 1) {
      tokens.push(chunk);
    } else {
      for (let i = 0; i + 1 < chunk.length; i++) tokens.push(chunk.slice(i, i + 2));
    }
  }
  return tokens;
}

/** token 序列 → 词频表 */
export function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/**
 * 由一组文档算 IDF。
 * 平滑公式 idf = ln((N+1)/(df+1)) + 1 —— 保证值恒为正, 罕见词权重高。
 */
export function buildIdf(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of docs) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
  }
  return idf;
}

/** 词频 × IDF → 归一化前的向量 */
export function tfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = termFreq(tokens);
  const vec = new Map<string, number>();
  for (const [term, count] of tf) {
    const weight = (1 + Math.log(count)) * (idf.get(term) ?? 1);
    vec.set(term, weight);
  }
  return vec;
}

/** L2 归一化 (原地修改并返回) */
export function l2normalize(vec: Map<string, number>): Map<string, number> {
  let sum = 0;
  for (const v of vec.values()) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm > 0) {
    for (const [k, v] of vec) vec.set(k, v / norm);
  }
  return vec;
}

/** 余弦相似度 (输入应已 L2 归一化, 这里兜底再算一次也没关系) */
export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [term, va] of small) {
    const vb = large.get(term);
    if (vb !== undefined) dot += va * vb;
  }
  return dot;
}

/**
 * 一个 TF-IDF 索引: 语料 IDF + 每篇文档的向量
 */
export type TfidfIndex = {
  idf: Map<string, number>;
  vectors: Map<string, Map<string, number>>;
};

/**
 * 建立索引。
 * @param docIds 文档 ID, 与 docs 一一对应
 * @param docs 文档原文
 */
export function buildTfidfIndex(docIds: string[], docs: string[]): TfidfIndex {
  const tokenized = docs.map((d) => tokenize(d));
  const idf = buildIdf(tokenized);
  const vectors = new Map<string, Map<string, number>>();
  docIds.forEach((id, i) => {
    vectors.set(id, l2normalize(tfidfVector(tokenized[i], idf)));
  });
  return { idf, vectors };
}

/** 用索引把一段新文本变成向量 */
export function vectorize(text: string, index: TfidfIndex): Map<string, number> {
  return l2normalize(tfidfVector(tokenize(text), index.idf));
}
