// =====================================================
// Module 3: 岗位画像补充
// =====================================================
import { useState } from 'react';
import { Target, Plus, X } from 'lucide-react';
import { Card, CardHeader, CardBody, Input, TextArea, Badge } from '@/components/ui/Card';
import type { JobProfile } from '@/types';

type Props = {
  value: JobProfile | null;
  onChange: (value: JobProfile | null) => void;
};

export function JobProfileModule({ value, onChange }: Props) {
  const profile = value ?? {
    dealBreakers: [],
    niceToHaves: [],
    culturalFit: '',
    targetCompanyTiers: [],
    targetSchoolTiers: [],
  };

  const update = (patch: Partial<JobProfile>) => {
    onChange({ ...profile, ...patch });
  };

  const [dealInput, setDealInput] = useState('');
  const [niceInput, setNiceInput] = useState('');

  const addDeal = () => {
    const v = dealInput.trim();
    if (!v) return;
    update({ dealBreakers: [...profile.dealBreakers, v] });
    setDealInput('');
  };

  const removeDeal = (idx: number) => {
    update({ dealBreakers: profile.dealBreakers.filter((_, i) => i !== idx) });
  };

  const addNice = () => {
    const v = niceInput.trim();
    if (!v) return;
    update({ niceToHaves: [...profile.niceToHaves, v] });
    setNiceInput('');
  };

  const removeNice = (idx: number) => {
    update({ niceToHaves: profile.niceToHaves.filter((_, i) => i !== idx) });
  };

  const toggleTier = (tierList: number[], tier: number): number[] => {
    return tierList.includes(tier)
      ? tierList.filter((t) => t !== tier)
      : [...tierList, tier];
  };

  const COMPANY_TIER_LABELS: Record<number, string> = {
    1: '顶级大厂',
    2: '大厂/上市',
    3: '独角兽',
    4: '上市中型',
    5: '知名外企',
    6: '普通外企',
    7: 'Startup',
  };

  const SCHOOL_TIER_LABELS: Record<number, string> = {
    1: '顶尖',
    2: '985头部',
    3: '985/211',
    4: '普通本科',
    5: '其他',
  };

  return (
    <Card>
      <CardHeader
        icon={<Target className="w-5 h-5" />}
        title="岗位画像补充"
        subtitle="顾问对岗位的额外判断 - 影响评分权重"
      />

      <CardBody className="space-y-5">
        {/* Deal-breakers */}
        <div>
          <label className="block text-xs font-medium text-fg-muted mb-2">
            一票否决项 <span className="text-fg-subtle">（命中则项目分 -15）</span>
          </label>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="例如：35岁以上 / 频繁跳槽 / 不接受出差"
              value={dealInput}
              onChange={(e) => setDealInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDeal();
                }
              }}
            />
            <button
              onClick={addDeal}
              className="shrink-0 h-10 px-3 rounded-lg bg-bg-elevated border border-border text-fg hover:border-accent-gold/50 transition-colors flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> 添加
            </button>
          </div>
          {profile.dealBreakers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.dealBreakers.map((item, idx) => (
                <Badge key={idx} color="red" variant="soft" className="gap-1 pr-1">
                  {item}
                  <button onClick={() => removeDeal(idx)} className="ml-1 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Nice-to-haves */}
        <div>
          <label className="block text-xs font-medium text-fg-muted mb-2">
            加分项 <span className="text-fg-subtle">（用于项目关键词匹配）</span>
          </label>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="例如：Kubernetes经验 / 开源项目 / 团队管理"
              value={niceInput}
              onChange={(e) => setNiceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNice();
                }
              }}
            />
            <button
              onClick={addNice}
              className="shrink-0 h-10 px-3 rounded-lg bg-bg-elevated border border-border text-fg hover:border-accent-gold/50 transition-colors flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> 添加
            </button>
          </div>
          {profile.niceToHaves.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.niceToHaves.map((item, idx) => (
                <Badge key={idx} color="gold" variant="soft" className="gap-1 pr-1">
                  {item}
                  <button onClick={() => removeNice(idx)} className="ml-1 hover:text-accent-gold">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Cultural fit */}
        <TextArea
          label="文化契合要求"
          placeholder="例如：狼性文化 / 创业精神 / 强自驱 / 抗压能力强"
          rows={2}
          value={profile.culturalFit}
          onChange={(e) => update({ culturalFit: e.target.value })}
        />

        {/* Target company tiers */}
        <div>
          <label className="block text-xs font-medium text-fg-muted mb-2">
            目标公司 tier <span className="text-fg-subtle">（多选，匹配 +5）</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(COMPANY_TIER_LABELS).map(([t, label]) => {
              const tier = parseInt(t, 10);
              const active = profile.targetCompanyTiers.includes(tier);
              return (
                <button
                  key={tier}
                  onClick={() => update({ targetCompanyTiers: toggleTier(profile.targetCompanyTiers, tier) })}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    active
                      ? 'bg-accent-gold/20 border-accent-gold text-accent-gold'
                      : 'bg-bg-input border-border text-fg-muted hover:border-border-strong'
                  }`}
                >
                  Tier {tier} · {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Target school tiers */}
        <div>
          <label className="block text-xs font-medium text-fg-muted mb-2">
            目标学校 tier <span className="text-fg-subtle">（信息参考）</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(SCHOOL_TIER_LABELS).map(([t, label]) => {
              const tier = parseInt(t, 10);
              const active = profile.targetSchoolTiers.includes(tier);
              return (
                <button
                  key={tier}
                  onClick={() => update({ targetSchoolTiers: toggleTier(profile.targetSchoolTiers, tier) })}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    active
                      ? 'bg-accent-gold/20 border-accent-gold text-accent-gold'
                      : 'bg-bg-input border-border text-fg-muted hover:border-border-strong'
                  }`}
                >
                  Tier {tier} · {label}
                </button>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}