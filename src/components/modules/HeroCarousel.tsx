// =====================================================
// HeroCarousel —— 首页岗位轮播大图
//
// 内容全部来自线上岗位池 (飞书实时数据), 一个客户一屏, 优先挑「明星 AI 公司」的岗位。
// 深色科技底 + 金色点缀, 和下面浅金属页面拉开对比 —— 这是整站第一眼的门面。
//
// 交互: 自动轮播 / 悬停暂停 / 左右切换 / 指示点 / 键盘左右键 / 点「查看岗位」联动右侧岗位详情。
// =====================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, MapPin, Sparkles } from 'lucide-react';
import { cn } from '@/components/ui/Card';
import { BrandMark, BrandPlate, useCompanyBrand } from '@/components/ui/CompanyLogo';
import { resolveCompanyBrand, STAR_COMPANIES } from '@/data/starCompanies';
import { useJobStore } from '@/store/useJobStore';
import type { JobPosition } from '../../../shared/jobs.ts';

const AUTO_MS = 6500;
const MAX_SLIDES = 6;

/** 从 JD 里抠一句能当摘要的话 */
function jobSummary(jd: string): string {
  if (!jd) return '';
  const first = jd
    .split(/[；;。\n]/)
    .map((s) => s.trim())
    .find((s) => s.length >= 8);
  const text = (first ?? jd).replace(/^\s*\d+\s*[、.．)）]\s*/, '');
  return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}

/** 挑轮播要放的岗位: 优先明星 AI 公司, 一个客户只出一屏 */
function pickSlides(jobs: JobPosition[]): JobPosition[] {
  const withJd = jobs.filter((j) => j.client && j.title && j.jdText);
  const seen = new Set<string>();
  const star: JobPosition[] = [];
  const rest: JobPosition[] = [];

  for (const job of withJd) {
    const brand = resolveCompanyBrand(job.client);
    // 认得出的按品牌去重 ("月之暗面|kimi" / "Kimi（月之暗面）" 是同一家),
    // 认不出的按去掉标点的客户名去重
    const key = brand
      ? `b:${brand.name}`
      : `c:${job.client.replace(/[\s()（）|｜/·&、,，.。]/g, '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (brand ? star : rest).push(job);
  }

  // 明星公司按品牌表里的顺序排 —— 让最有辨识度的先出场
  const order = new Map(STAR_COMPANIES.map((c, i) => [c.name, i]));
  star.sort((a, b) => {
    const ra = resolveCompanyBrand(a.client);
    const rb = resolveCompanyBrand(b.client);
    return (order.get(ra?.name ?? '') ?? 99) - (order.get(rb?.name ?? '') ?? 99);
  });

  return [...star, ...rest].slice(0, MAX_SLIDES);
}

export function HeroCarousel() {
  const jobs = useJobStore((s) => s.jobs);
  const jobsStatus = useJobStore((s) => s.jobsStatus);
  const selectJob = useJobStore((s) => s.selectJob);
  const matches = useJobStore((s) => s.matches);
  const topMatches = useJobStore((s) => s.topMatches);

  const slides = useMemo(() => pickSlides(jobs), [jobs]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (next: number) => setIndex((next + slides.length) % Math.max(1, slides.length)),
    [slides.length],
  );

  // 岗位池重新加载后, 索引可能越界
  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), AUTO_MS);
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') go(index - 1);
    if (e.key === 'ArrowRight') go(index + 1);
  };

  const clients = useMemo(() => new Set(jobs.map((j) => j.client).filter(Boolean)).size, [jobs]);
  const tracks = useMemo(() => new Set(jobs.map((j) => j.track)).size, [jobs]);

  const active = slides[index] ?? slides[0];
  const { brand: activeBrand } = useCompanyBrand(active?.client ?? '');
  const activeColor = activeBrand?.color ?? '#6C8CFF';

  // 岗位详情抽屉要有匹配结果才打得开 —— 还没上传简历时, 改成把人引到上传区
  const hasResult = useMemo(
    () =>
      !!active &&
      (topMatches.some((m) => m.job.id === active.id) || matches.some((m) => m.job.id === active.id)),
    [active, matches, topMatches],
  );

  if (!slides.length) {
    return (
      <section className="relative overflow-hidden rounded-3xl bg-[#080D18] border border-white/10 mb-6">
        <div className="absolute inset-0 tech-grid opacity-40" />
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-accent-gold/20 blur-3xl" />
        <div className="relative px-8 py-12 md:py-16">
          <p className="font-mono text-[11px] tracking-[0.3em] text-accent-gold uppercase">
            {jobsStatus === 'loading' ? 'Loading positions' : 'Boss AI Talent'}
          </p>
          <h1 className="mt-4 font-serif text-3xl md:text-5xl font-bold text-white leading-tight max-w-3xl">
            连接顶尖 AI 人才与<span className="text-gold-gradient">明星科技公司</span>
          </h1>
          <p className="mt-4 text-sm text-white/50 max-w-xl leading-relaxed">
            {jobsStatus === 'loading'
              ? '正在从飞书拉取在招岗位…'
              : '岗位库暂时读不到，刷新页面重试。简历上传、岗位匹配、AI 精排照常可用。'}
          </p>
        </div>
      </section>
    );
  }

  const handleCta = () => {
    if (hasResult) {
      selectJob(active.id);
      return;
    }
    const el = document.querySelector('[data-module="resume-upload"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('ring-pulse');
    window.setTimeout(() => el?.classList.remove('ring-pulse'), 2400);
  };

  return (
    <section
      ref={regionRef}
      className="relative overflow-hidden rounded-3xl bg-[#080D18] border border-white/10 mb-6 shadow-[0_24px_80px_-24px_rgba(8,13,24,0.55)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
      tabIndex={0}
      aria-roledescription="轮播"
      aria-label="在招岗位轮播"
    >
      {/* 背景: 网格 + 双色光晕 + 扫描线 */}
      <div className="absolute inset-0 tech-grid opacity-60" aria-hidden />
      <div
        className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full blur-3xl transition-colors duration-700"
        style={{ background: `${activeColor}33` }}
        aria-hidden
      />
      <div className="absolute -bottom-40 right-0 w-[460px] h-[460px] rounded-full bg-accent-gold/12 blur-3xl" aria-hidden />
      <div className="absolute inset-0 hero-scanline opacity-30" aria-hidden />

      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 px-6 md:px-10 py-10 md:py-14">
        {/* 左: 文案 */}
        <div className="lg:col-span-7 flex flex-col justify-center min-w-0">
          <div key={active.id} className="animate-fade-in">
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-gold/15 border border-accent-gold/30 text-accent-gold text-[11px] font-medium">
                <Sparkles className="w-3 h-3" />
                {active.trackLabel}
              </span>
              {active.location && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/60 text-[11px]">
                  <MapPin className="w-3 h-3" />
                  {active.location}
                </span>
              )}
              {active.priority && (
                <span className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/60 text-[11px]">
                  {active.priority}
                </span>
              )}
            </div>

            <HeroBrand client={active.client} />

            <h2 className="mt-5 font-serif text-[26px] md:text-[38px] leading-[1.25] font-bold text-white max-w-2xl">
              {active.title}
            </h2>

            <p className="mt-4 text-sm md:text-[15px] text-white/55 leading-relaxed max-w-2xl">
              {jobSummary(active.jdText)}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={handleCta}
                className="group inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-gradient-to-r from-[#D8BC78] to-[#C9A961] text-[#1A1206] text-sm font-semibold shadow-[0_8px_28px_-8px_rgba(201,169,97,0.75)] transition-transform hover:-translate-y-0.5"
              >
                {hasResult ? '查看岗位详情' : '上传简历，看匹配结果'}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <span className="font-mono text-[11px] text-white/45 tracking-wider">
                上传简历 · AI 匹配 · 智能精排
              </span>
            </div>
          </div>

          {/* 切换控件 */}
          <div className="mt-9 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => go(i)}
                  aria-label={`第 ${i + 1} 屏: ${resolveCompanyBrand(s.client)?.name ?? s.client}`}
                  aria-current={i === index}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === index ? 'w-8 bg-accent-gold' : 'w-1.5 bg-white/25 hover:bg-white/50'
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => go(index - 1)}
                aria-label="上一屏"
                className="w-8 h-8 rounded-lg border border-white/12 bg-white/[0.04] text-white/60 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => go(index + 1)}
                aria-label="下一屏"
                className="w-8 h-8 rounded-lg border border-white/12 bg-white/[0.04] text-white/60 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 右: 大号品牌视觉 */}
        <div className="lg:col-span-5 flex items-center justify-center">
          <div key={`visual-${active.id}`} className="relative animate-fade-in w-full max-w-[380px] aspect-square">
            <HeroOrb client={active.client} />
          </div>
        </div>
      </div>

      {/* 底部数据条 */}
      <div className="relative border-t border-white/8 bg-black/25">
        <div className="px-6 md:px-10 py-4 flex flex-wrap items-center gap-x-10 gap-y-3">
          <Stat value={jobs.length} label="在招岗位" />
          <Stat value={clients} label="合作客户" />
          <Stat value={tracks || 8} label="岗位方向" />
          <Stat value={jobSummary(active.jdText) ? '实时' : '—'} label="数据来源 飞书岗位库" />
        </div>
      </div>
    </section>
  );
}

function brandColor(job: JobPosition): string {
  return resolveCompanyBrand(job.client)?.color ?? '#6C8CFF';
}

/** 大标题里的客户名 —— 白底官方 logo 牌 + 品牌色字 + 英文小字 */
function HeroBrand({ client }: { client: string }) {
  const { brand, label, en } = useCompanyBrand(client);
  const color = brand?.color ?? '#8CA0FF';
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        {/* 品牌色光晕垫在牌子下面, 白牌才有立体感 */}
        <span
          className="absolute -inset-2.5 rounded-[26px] blur-xl"
          style={{ background: `radial-gradient(circle, ${color}66, transparent 70%)` }}
          aria-hidden
        />
        <BrandPlate client={client} size="lg" tone="dark" className="relative" />
      </div>
      <div className="min-w-0">
        <p
          className="font-serif text-2xl md:text-3xl font-bold leading-tight"
          style={{ color, textShadow: `0 0 28px ${color}55` }}
        >
          {label}
        </p>
        {en && (
          <p className="font-mono text-[10px] tracking-[0.28em] text-white/40 mt-1 uppercase">
            {en}
          </p>
        )}
      </div>
    </div>
  );
}

/** 右侧大圆盘: 同心环 + 中心官方 logo 白牌 + 旋转光弧 */
function HeroOrb({ client }: { client: string }) {
  const { brand } = useCompanyBrand(client);
  const color = brand?.color ?? '#6C8CFF';
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div
        className="absolute inset-0 rounded-full border opacity-40"
        style={{ borderColor: `${color}44` }}
      />
      <div
        className="absolute inset-[12%] rounded-full border border-dashed opacity-30 tech-ring"
        style={{ borderColor: `${color}66` }}
      />
      <div
        className="absolute inset-[24%] rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${color}44, transparent 70%)` }}
      />
      <div
        className="absolute inset-[26%] rounded-full border opacity-50"
        style={{
          borderColor: `${color}33`,
          background: `linear-gradient(140deg, ${color}22, rgba(255,255,255,0.02))`,
          backdropFilter: 'blur(6px)',
        }}
      />
      {/* 中心: 白底官方 logo (牌子跟着 logo 长宽走, 不裁字标) */}
      <div
        className="relative flex items-center justify-center max-w-[78%] rounded-[26px] px-8 py-6"
        style={{
          background: '#FFFFFF',
          border: '1px solid rgba(255,255,255,0.55)',
          boxShadow: `0 0 60px ${color}66, 0 18px 40px -18px rgba(0,0,0,0.6)`,
        }}
      >
        <BrandMark client={client} height={74} maxWidth={250} />
      </div>
      {/* 环绕小点 */}
      {[
        'left-1/2 -translate-x-1/2 top-0',
        'right-0 top-1/2 -translate-y-1/2',
        'left-1/2 -translate-x-1/2 bottom-0',
        'left-0 top-1/2 -translate-y-1/2',
      ].map((pos, i) => (
        <span
          key={i}
          className={cn('absolute w-1.5 h-1.5 rounded-full', pos)}
          style={{ background: color, boxShadow: `0 0 12px ${color}` }}
        />
      ))}
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-lg text-accent-gold font-medium">{value}</span>
      <span className="text-[11px] text-white/40 tracking-wide">{label}</span>
    </div>
  );
}
