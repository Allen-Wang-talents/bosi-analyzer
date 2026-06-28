// =====================================================
// 公司概况文本解析 - 从表单输入或自由文本提取字段
// =====================================================
import type { Company } from '@/types';

export function parseCompany(input: {
  name: string;
  industry: string;
  size: string;
  stage: string;
  business: string;
  products: string;
  website?: string;
}): Company | null {
  const { name, industry, size, stage, business, products, website } = input;
  if (!name && !business && !products) return null;

  return {
    name: name?.trim() || '',
    industry: industry?.trim() || '',
    size: size?.trim() || '',
    stage: stage?.trim() || '',
    business: business?.trim() || '',
    products: products?.trim() || '',
    website: website?.trim() || undefined,
  };
}