// =====================================================
// 精排结果解析测试
//
// 模型输出不保证是干净的 JSON, 解析器必须扛住:
//   markdown 围栏 / 前后废话 / <think> 块 / 单项字段缺失 / 截断
// =====================================================
import { describe, it, expect } from 'vitest';
import { parseRankItems } from '../../shared/rankParse.ts';

describe('parseRankItems', () => {
  it('解析标准 JSON 数组', () => {
    const items = parseRankItems(
      '[{"id":"a1","score":87,"reason":"命中大模型后训练","gaps":["没有多模态经验"]}]'
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: 'a1',
      score: 87,
      reason: '命中大模型后训练',
      gaps: ['没有多模态经验'],
    });
  });

  it('剥掉 markdown 代码围栏', () => {
    const items = parseRankItems(
      '```json\n[{"id":"a1","score":80,"reason":"匹配","gaps":[]}]\n```'
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('a1');
  });

  it('剥掉 <think> 推理块', () => {
    const items = parseRankItems(
      '<think>让我想想…</think>[{"id":"a1","score":80,"reason":"匹配","gaps":[]}]'
    );
    expect(items).toHaveLength(1);
  });

  it('容忍数组前后的废话', () => {
    const items = parseRankItems(
      '好的，以下是结果：\n[{"id":"a1","score":80,"reason":"匹配","gaps":[]}]\n希望对你有帮助！'
    );
    expect(items).toHaveLength(1);
  });

  it('也认 {results:[...]} 这种包装', () => {
    const items = parseRankItems('{"results":[{"id":"a1","score":80,"reason":"匹配","gaps":[]}]}');
    expect(items).toHaveLength(1);
  });

  it('丢掉不合法的项, 不影响合法的项', () => {
    const items = parseRankItems(
      '[{"noId":true},{"id":"a1","score":80,"reason":"匹配","gaps":[]},{"id":"","score":1}]'
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('a1');
  });

  it('分数越界时夹到 0-100', () => {
    const items = parseRankItems('[{"id":"a1","score":150,"reason":"x","gaps":[]},{"id":"a2","score":-20,"reason":"x","gaps":[]}]');
    expect(items[0].score).toBe(100);
    expect(items[1].score).toBe(0);
  });

  it('gaps 里非字符串的丢掉', () => {
    const items = parseRankItems('[{"id":"a1","score":80,"reason":"x","gaps":["真的差距", 123, null]}]');
    expect(items[0].gaps).toEqual(['真的差距']);
  });

  it('被截断的输出返回空数组 (调用方据此分批重问)', () => {
    expect(parseRankItems('[{"id":"a1","score":80,"reason":"被截断')).toEqual([]);
  });

  it('完全不是 JSON 返回空数组', () => {
    expect(parseRankItems('抱歉，我无法完成')).toEqual([]);
    expect(parseRankItems('')).toEqual([]);
  });
});
