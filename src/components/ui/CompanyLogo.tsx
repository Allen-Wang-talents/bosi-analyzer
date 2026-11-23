// =====================================================
// CompanyLogo —— 官方 logo + 统一白底牌
//
// 各家官方 logo 风格差得远: 有的纯图形 (百度爪印), 有的中英文字标 (RayNeo、商汤),
// 有的整块深色底 (01.AI、理想), 直接扔到页面上就是花的。
// 统一办法: 全部放进同样大小的白底牌子里 —— 白底统一了各家底色, 牌子下沿再压一条
// 品牌色细光条, 一整排扫过去就是齐的。
// 扒不到官方 logo 的公司退化成文字徽标, 牌子不变, 视觉不断层。
// =====================================================
import { useState } from 'react';
import { cn } from '@/components/ui/Card';
import { resolveCompanyBrand, fallbackMark, type StarCompany } from '@/data/starCompanies';

type Size = 'sm' | 'md' | 'lg';

const SIZES = {
  sm: { chip: 'h-10', pad: 'px-2.5', mark: 'text-[15px]', name: 'text-[13px]', en: 'text-[9px]', logo: 22 },
  md: { chip: 'h-12', pad: 'px-3', mark: 'text-lg', name: 'text-base', en: 'text-[10px]', logo: 26 },
  lg: { chip: 'h-16', pad: 'px-4', mark: 'text-2xl', name: 'text-2xl', en: 'text-xs', logo: 34 },
} as const;

type Props = {
  /** 岗位池里的客户名 (原样) */
  client: string;
  /** 尺寸 */
  size?: Size;
  /** 深色底 (轮播大图里用) 还是浅色底 (页面里用) */
  tone?: 'dark' | 'light';
  /** 是否显示英文名 */
  showEn?: boolean;
  className?: string;
};

/** 认出品牌就用品牌色 + 品牌名; 认不出就按客户名生成通用徽标 */
export function useCompanyBrand(
  client: string,
): { brand: StarCompany | null; mark: string; label: string; en: string; logo?: string } {
  const brand = resolveCompanyBrand(client);
  const rawLabel = client.split(/[|｜/·&]/)[0]?.trim() || client;
  return {
    brand,
    mark: brand?.mark ?? fallbackMark(client),
    label: brand?.name ?? rawLabel,
    en: brand?.en ?? '',
    logo: brand?.logo,
  };
}

/**
 * 光秃秃的 logo 本体 (没有牌子) —— 供轮播大图里自己套外框用。
 * 官方 logo 加载失败时自动退化成文字徽标。
 */
export function BrandMark({
  client,
  height,
  maxWidth,
  className,
}: {
  client: string;
  height: number;
  /** 宽度上限 —— 字标类 logo 很宽, 不设限会撑破牌子 */
  maxWidth?: number;
  className?: string;
}) {
  const { brand, mark, logo } = useCompanyBrand(client);
  const [broken, setBroken] = useState(false);
  const color = brand?.color ?? '#64748B';

  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={cn('block object-contain', className)}
        style={{ height, width: 'auto', maxWidth: maxWidth ?? height * 4.5 }}
      />
    );
  }
  return (
    <span
      className={cn('font-bold leading-none tracking-tight', className)}
      style={{ color, fontSize: height * 0.6 }}
    >
      {mark}
    </span>
  );
}

/** 统一白底牌: 所有公司 logo 都放这儿, 尺寸/圆角/阴影一致 */
export function BrandPlate({
  client,
  size = 'md',
  tone = 'light',
  className,
}: {
  client: string;
  size?: Size;
  tone?: 'dark' | 'light';
  className?: string;
}) {
  const { brand } = useCompanyBrand(client);
  const s = SIZES[size];
  const color = brand?.color ?? '#64748B';

  return (
    <div
      className={cn(
        'relative shrink-0 inline-flex items-center justify-center overflow-hidden',
        s.chip,
        s.pad,
        className
      )}
      style={{
        background: '#FFFFFF',
        border: tone === 'dark' ? '1px solid rgba(255,255,255,0.55)' : '1px solid rgba(15,23,42,0.10)',
        boxShadow:
          tone === 'dark'
            ? `0 2px 6px rgba(0,0,0,0.35), 0 14px 34px -14px ${color}AA, inset 0 1px 0 rgba(255,255,255,0.9)`
            : `0 1px 2px rgba(15,23,42,0.07), 0 10px 24px -12px ${color}66`,
      }}
    >
      <BrandMark client={client} height={s.logo} />
      {/* 品牌色细光条 —— 一排扫过去靠它把各家颜色串起来 */}
      <span
        className="absolute left-0 right-0 bottom-0 h-[2px] opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
    </div>
  );
}

export function CompanyLogo({ client, size = 'md', tone = 'light', showEn = true, className }: Props) {
  const { label, en } = useCompanyBrand(client);
  const s = SIZES[size];

  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <BrandPlate client={client} size={size} tone={tone} />

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
