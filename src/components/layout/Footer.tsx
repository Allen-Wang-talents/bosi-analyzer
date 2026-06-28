// =====================================================
// Footer
// =====================================================
export function Footer() {
  return (
    <footer className="border-t border-border py-4 mt-auto">
      <div className="max-w-[1600px] mx-auto px-6 flex items-center justify-between text-xs text-fg-subtle">
        <span>博思人才评荐网 · 猎头顾问专用简历分析工具</span>
        <span className="font-mono">v1.0 · {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}