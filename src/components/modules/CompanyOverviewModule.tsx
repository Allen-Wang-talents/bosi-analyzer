// =====================================================
// Module 1: 公司概况
// =====================================================
import { Building2 } from 'lucide-react';
import { Card, CardHeader, CardBody, Input, TextArea, Select } from '@/components/ui/Card';
import type { Company } from '@/types';

type Props = {
  value: Company | null;
  onChange: (value: Company | null) => void;
};

const SIZE_OPTIONS = [
  { value: '', label: '请选择' },
  { value: '< 50', label: '< 50 人' },
  { value: '50-200', label: '50-200 人' },
  { value: '200-500', label: '200-500 人' },
  { value: '500-1000', label: '500-1000 人' },
  { value: '1000-5000', label: '1000-5000 人' },
  { value: '5000-10000', label: '5000-10000 人' },
  { value: '10000+', label: '10000+ 人' },
];

const STAGE_OPTIONS = [
  { value: '', label: '请选择' },
  { value: '未融资', label: '未融资' },
  { value: '天使轮', label: '天使轮' },
  { value: 'Pre-A', label: 'Pre-A' },
  { value: 'A轮', label: 'A 轮' },
  { value: 'B轮', label: 'B 轮' },
  { value: 'C轮', label: 'C 轮' },
  { value: 'D轮+', label: 'D 轮及以上' },
  { value: '已上市', label: '已上市' },
  { value: '已退市', label: '已退市' },
  { value: '被收购', label: '被收购' },
];

export function CompanyOverviewModule({ value, onChange }: Props) {
  const c = value ?? { name: '', industry: '', size: '', stage: '', business: '', products: '', website: '' };

  const update = (patch: Partial<Company>) => {
    onChange({ ...c, ...patch });
  };

  return (
    <Card>
      <CardHeader
        icon={<Building2 className="w-5 h-5" />}
        title="公司概况"
        subtitle="客户公司背景 - 用于分析岗位匹配"
      />

      <CardBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="公司名称"
            placeholder="例如：字节跳动"
            value={c.name}
            onChange={(e) => update({ name: e.target.value })}
          />
          <Input
            label="行业"
            placeholder="例如：互联网 / 电商 / 金融"
            value={c.industry}
            onChange={(e) => update({ industry: e.target.value })}
          />
          <Select
            label="公司规模"
            value={c.size}
            onChange={(v) => update({ size: v })}
            options={SIZE_OPTIONS}
          />
          <Select
            label="融资阶段"
            value={c.stage}
            onChange={(v) => update({ stage: v })}
            options={STAGE_OPTIONS}
          />
          <Input
            label="公司网址"
            placeholder="https://"
            value={c.website ?? ''}
            onChange={(e) => update({ website: e.target.value })}
            className="sm:col-span-2"
          />
          <TextArea
            label="主营业务"
            placeholder="一句话描述主营业务"
            rows={2}
            value={c.business}
            onChange={(e) => update({ business: e.target.value })}
            className="sm:col-span-2"
          />
          <TextArea
            label="关键产品"
            placeholder="主要产品/服务名称（影响关键词匹配）"
            rows={2}
            value={c.products}
            onChange={(e) => update({ products: e.target.value })}
            className="sm:col-span-2"
          />
        </div>
      </CardBody>
    </Card>
  );
}