// =====================================================
// CompanyLogo —— 自造字标 + 徽标
//
// 不用官方 logo 素材: 国内 AI 公司拿不到可商用的 logo, 岗位池里 72 家客户名字格式
// 又各不相同, 真 logo 覆盖率低、风格还不统一。
// 所以统一用「徽标块 + 中文名 + 英文名」, 每个品牌配一个识别色, 靠排版和光晕做质感。
// =====================================================
import { cn } from '@/components/ui/Card';
import { resolveCompanyBrand, fallbackMark, type StarCompany } from '@/data/starCompanies';

type Props = {
  /** 岗位池里的客户名 (原样) */
  client: string;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 深色底 (轮播大图里用) 还是浅色底 (页面里用) */
  tone?: 'dark' | 'light';
  /** 是否显示英文名 */
  showEn?: boolean;
  className?: string;
};

const SIZES = {
  sm: { box: 'w-9 h-9 rounded-lg text-[13px]', name: 'text-[13px]', en: 'text-[9px]' },
  md: { box: 'w-12 h-12 rounded-xl text-base', name: 'text-base', en: 'text-[10px]' },
  lg: { box: 'w-[72px] h-[72px] rounded-2xl text-2xl', name: 'text-2xl', en: 'text-xs' },
} as const;

/** 认出品牌就用品牌色 + 品牌名; 认不出就按客户名生成通用徽标 */
export function useCompanyBrand(client: string): { brand: StarCompany | null; mark: string; label: string; en: string } {
  const brand = resolveCompanyBrand(client);
  const rawLabel = client.split(/[|｜/·&]/)[0]?.trim() || client;
  return {
    brand,
    mark: brand?.mark ?? fallbackMark(client),
    label: brand?.name ?? rawLabel,
    en: brand?.en ?? '',
  };
}

export function CompanyLogo({ client, size = 'md', tone = 'light', showEn = true, className }: Props) {
  const { brand, mark, label, en } = useCompanyBrand(client);
  const s = SIZES[size];
  const color = brand?.color ?? '#64748B';

  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <div
        className={cn(
          'shrink-0 flex items-center justify-center font-semibold relative overflow-hidden',
          s.box,
          tone === 'dark'
            ? 'border border-white/15 bg-white/[0.06] backdrop-blur-sm'
            : 'border border-border bg-bg-elevated'
        )}
        style={
          tone === 'dark'
            ? { boxShadow: `0 0 22px ${color}55, inset 0 1px 0 rgba(255,255,255,0.12)` }
            : { boxShadow: `0 0 14px ${color}30` }
        }
      >
        {/* 品牌色底光 */}
        <span
          className="absolute inset-0 opacity-25"
          style={{ background: `radial-gradient(circle at 30% 20%, ${color}, transparent 70%)` }}
        />
        <span className="relative tracking-tight" style={{ color }}>
          {mark}
        </span>
      </div>

      <div className="min-w-0">
        <p
          className={cn(
            'font-semibold leading-tight truncate',
            s.name,
            tone === 'dark' ? 'text-white' : 'text-fg'
          )}
        >
          {label}
        </p>
        {showEn && en && (
          <p
            className={cn(
              'font-mono tracking-[0.18em] truncate mt-0.5',
              s.en,
              tone === 'dark' ? 'text-white/45' : 'text-fg-subtle'
            )}
          >
            {en}
          </p>
        )}
      </div>
    </div>
  );
}
