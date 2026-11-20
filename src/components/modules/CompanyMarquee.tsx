// =====================================================
// CompanyMarquee —— 明星 AI 公司 logo 无限滚动带
//
// 放在首页轮播下面, 一行慢慢横向滚过去, 鼠标悬停停住。
// 名单有两层: 品牌表里的明星公司 + 岗位池里实际有在招岗位的客户 ——
// 后者说明「我们真的在给这家公司招人」, 比硬凑的名头有说服力。
// =====================================================
import { useMemo } from 'react';
import { CompanyLogo } from '@/components/ui/CompanyLogo';
import { resolveCompanyBrand } from '@/data/starCompanies';
import { useJobStore } from '@/store/useJobStore';

const MAX_LOGOS = 30;

export function CompanyMarquee() {
  const jobs = useJobStore((s) => s.jobs);

  // 岗位池里真实在招的客户 (去重, 排除空名)
  // 明星 AI 公司排前面 —— 视觉上有分量, 也说明我们在给这些公司招人
  const { clients, total } = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const j of jobs) {
      const brand = resolveCompanyBrand(j.client);
      const name = brand ? brand.name : j.client?.split(/[|｜/·&]/)[0]?.trim();
      if (!name) continue;
      // 同一家公司在岗位池里名字格式不一 ("月之暗面|kimi" / "Kimi（月之暗面）"), 按归一后的名字去重
      const key = brand
        ? `b:${brand.name}`
        : `c:${name.replace(/[\s()（）|｜/·&、,，.。]/g, '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    out.sort((a, b) => Number(Boolean(resolveCompanyBrand(b))) - Number(Boolean(resolveCompanyBrand(a))));
    return { clients: out.slice(0, MAX_LOGOS), total: out.length };
  }, [jobs]);

  if (!clients.length) return null;

  // 播两遍, 第二遍无缝接上
  const loop = [...clients, ...clients];

  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card/70 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <span className="font-mono text-[10px] tracking-[0.28em] text-fg-subtle uppercase">
          Trusted By
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border-strong to-transparent" />
        <span className="text-[11px] text-fg-subtle">
          正在为这些 AI 公司寻访人才{total > MAX_LOGOS ? ` · 等 ${total} 家` : ''}
        </span>
      </div>

      <div className="relative group">
        {/* 左右渐隐, 让滚动看起来是「从边缘出来」 */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-bg-card to-transparent z-10" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-bg-card to-transparent z-10" />

        <div className="marquee-track flex items-center gap-8 py-3 w-max group-hover:[animation-play-state:paused]">
          {loop.map((client, i) => (
            <div
              key={`${client}-${i}`}
              className={cnLogo(i >= clients.length)}
              aria-hidden={i >= clients.length}
            >
              <CompanyLogo client={client} size="sm" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function cnLogo(isCopy: boolean) {
  return isCopy ? 'opacity-60' : 'opacity-100';
}
