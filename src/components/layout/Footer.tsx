// =====================================================
// Footer
// =====================================================
export function Footer() {
  return (
    <footer className="relative border-t border-border py-5 mt-auto">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-gold/40 to-transparent" />
      <div className="max-w-[1600px] mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-fg-subtle">
        <div className="flex items-center gap-3">
          <span>博思AI人才推荐网 · 猎头顾问专用简历分析工具</span>
          <span className="hidden sm:inline h-3 w-px bg-border-strong" />
          <span className="hidden sm:inline font-mono tracking-wider text-[10px] uppercase">
            Powered by Feishu · MiniMax
          </span>
        </div>
        <span className="font-mono">v1.0 · {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
