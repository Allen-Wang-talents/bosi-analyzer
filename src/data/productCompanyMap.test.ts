import { describe, it, expect } from 'vitest';
import { resolveCompanyName } from './productCompanyMap';

describe('公司名解析: 拉丁产品键不能子串乱匹配', () => {
  // 'UC' 是阿里巴巴旗下 UC 浏览器的缩写, 以前用子串匹配 ->
  // 'EDUCATION' / 'SUCCESS Corp' / 'UC Berkeley' 全被解析成阿里巴巴
  it('不会把含 UC 的普通英文词当成 UC 浏览器', () => {
    expect(resolveCompanyName('EDUCATION')).not.toBe('阿里巴巴');
    expect(resolveCompanyName('SUCCESS Corp')).not.toBe('阿里巴巴');
    expect(resolveCompanyName('UC Berkeley')).not.toBe('阿里巴巴');
  });

  it('真正指 UC 产品的还是能认出来', () => {
    expect(resolveCompanyName('UC浏览器')).toBe('阿里巴巴');
    expect(resolveCompanyName('UC')).toBe('阿里巴巴');
  });

  it('中文产品名照常按长键优先匹配', () => {
    expect(resolveCompanyName('字节跳动 - 抖音电商')).toBe('字节跳动');
    expect(resolveCompanyName('高德地图')).toBe('阿里巴巴');
    expect(resolveCompanyName('今日头条')).toBe('字节跳动');
  });

  it('公司名本身不被误改', () => {
    expect(resolveCompanyName('京东方')).toBe('京东方');
    expect(resolveCompanyName('京东')).toBe('京东');
    expect(resolveCompanyName('蚂蚁')).toBe('蚂蚁集团');
  });
});

describe('公司名解析: "公司 - 产品/部门" 取左边的公司', () => {
  // Allen 2026-11-25: 原来按"最长的母公司"选, 右边是产品名时会顶掉真正的雇主
  //   "字节跳动 - 可灵" → 被认成 "快手"
  it('雇主在左, 产品在右', () => {
    expect(resolveCompanyName('字节跳动 - 可灵')).toBe('字节跳动');
    expect(resolveCompanyName('字节跳动 - 抖音电商')).toBe('字节跳动');
    expect(resolveCompanyName('腾讯 - 微信')).toBe('腾讯');
    expect(resolveCompanyName('百度 - 文心一言')).toBe('百度');
  });

  it('左边本身就是产品时, 仍然归一到母公司', () => {
    expect(resolveCompanyName('可灵')).toBe('快手');
    expect(resolveCompanyName('文心一言')).toBe('百度');
    expect(resolveCompanyName('星火')).toBe('科大讯飞');
    expect(resolveCompanyName('Kimi')).toBe('月之暗面');
  });
});
