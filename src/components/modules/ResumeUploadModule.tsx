// =====================================================
// Module 4: 上传简历
//
// Allen 2026-07-30 切换到大模型主导解析:
//   - 上传后默认走 LLM 解析（精准提取完整结构化信息）
//   - LLM 失败/超时/服务不可用时静默降级到本地规则解析
//   - 支持图片 OCR / 扫描件 PDF / HTML / RTF / DOCX / TXT
//   - 剪贴板粘贴 (Ctrl+V 图片/HTML/文本)
//
// Allen 2026-07-22 增强:
//   - 支持图片 OCR (JPG/PNG/WebP/HEIC)
//   - 支持 HTML / RTF 简历
//   - 扫描件 PDF 自动 OCR 兜底
//   - 剪贴板粘贴 (Ctrl+V 图片/HTML/文本)
//   - 解析进度展示
// =====================================================
import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, AlertCircle, Loader2, X, RefreshCw, ChevronDown, Image as ImageIcon, Code, FileType2, ClipboardPaste, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardBody, TextArea, Badge, Button } from '@/components/ui/Card';
import { parseResume, parseResumeText } from '@/lib/parseResume';
import type { Candidate } from '@/types';

type Props = {
  value: Candidate | null;
  onChange: (value: Candidate | null) => void;
};

const ACCEPT_MAP = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt', '.md'],
  'text/html': ['.html', '.htm'],
  'application/rtf': ['.rtf'],
  'text/rtf': ['.rtf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/bmp': ['.bmp'],
  'image/gif': ['.gif'],
};

export function ResumeUploadModule({ value, onChange }: Props) {
  const candidate = value;
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const runParse = useCallback(async (parseFn: () => Promise<Candidate>) => {
    setError(null);
    setParsing(true);
    setProgress('正在解析...');
    try {
      const parsed = await parseFn();
      onChange(parsed);
      setProgress(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`简历解析失败: ${msg}。建议尝试粘贴文本方式。`);
      setProgress(null);
    } finally {
      setParsing(false);
    }
  }, [onChange]);

  const handleProgress = useCallback((msg: string) => {
    setProgress(msg);
  }, []);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    await runParse(() => parseResume(file, handleProgress));
  }, [runParse, handleProgress]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPT_MAP,
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024, // 20MB（图片 + OCR 体积可能更大）
    disabled: parsing,
    noClick: false,
    noKeyboard: false,
  });

  const handlePasteText = (text: string) => {
    if (!text.trim()) {
      onChange(null);
      return;
    }
    try {
      const parsed = parseResumeText(text);
      onChange(parsed);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`文本解析失败: ${msg}`);
    }
  };

  // ===========================================
  // 剪贴板粘贴支持 (Ctrl+V)
  // ===========================================
  useEffect(() => {
    if (!cardRef.current) return;
    const el = cardRef.current;

    const handler = async (ev: ClipboardEvent) => {
      if (parsing) return;
      const items = ev.clipboardData?.items;
      if (!items || items.length === 0) return;

      // 检查是否有图片或 HTML
      const hasMedia = Array.from(items).some(
        (it) => it.type.startsWith('image/') || it.type === 'text/html'
      );
      if (!hasMedia) return; // 让浏览器默认处理文本粘贴

      ev.preventDefault();
      for (const it of Array.from(items)) {
        const item = it as DataTransferItem;
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (!file) continue;
        if (file.type.startsWith('image/')) {
          await runParse(() => parseResume(file, handleProgress));
          return;
        }
      }
      // HTML 走文本提取
      const html = ev.clipboardData?.getData('text/html');
      if (html) {
        try {
          const tmp = document.createElement('div');
          tmp.innerHTML = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
          const text = (tmp.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (text) {
            handlePasteText(text);
            return;
          }
        } catch {
          // 忽略错误
        }
      }
    };

    el.addEventListener('paste', handler);
    return () => el.removeEventListener('paste', handler);
  }, [parsing, runParse, handleProgress]);

  return (
    <div ref={cardRef}>
      <Card>
        <CardHeader
          icon={<Upload className="w-5 h-5" />}
          title="上传简历"
          subtitle="支持 PDF / DOCX / 图片 / HTML / RTF / TXT · 也可 Ctrl+V 粘贴图片"
        />

        <CardBody className="space-y-4">
        {/* Dropzone */}
        <div
          {...getRootProps()}
          role="button"
          tabIndex={0}
          aria-label="点击或拖入简历文件"
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all select-none ${
            isDragActive
              ? 'border-accent-gold bg-accent-gold/10'
              : 'border-border hover:border-accent-gold/50 bg-bg-input/30'
          } ${parsing ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input {...getInputProps()} />
          {parsing ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-accent-gold animate-spin" />
              <p className="text-sm text-fg-muted">{progress ?? '正在解析简历...'}</p>
              {progress?.includes('OCR') && (
                <p className="text-xs text-fg-subtle">首次加载 OCR 引擎约需 5-10 秒</p>
              )}
              {progress?.includes('AI 智能解析') && (
                <p className="text-xs text-fg-subtle flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> 大模型解析中，约 5-25 秒
                </p>
              )}
              {progress?.includes('已使用本地规则') && (
                <p className="text-xs text-status-yellow flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> AI 解析失败，已降级到本地规则
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-8 h-8 text-fg-muted" />
              <div>
                <p className="text-sm text-fg font-medium">
                  {isDragActive ? '松开以上传' : '拖入简历文件 或 点击选择'}
                </p>
                <p className="text-xs text-fg-subtle mt-1">
                  PDF · DOCX · 图片(JPG/PNG/WebP) · HTML · RTF · TXT · 最大 20MB
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={(e) => { e.stopPropagation(); open(); }}
                className="pointer-events-auto"
              >
                <FileText className="w-4 h-4" /> 选择文件
              </Button>
            </div>
          )}
        </div>

        {/* 支持的格式快捷入口（图标） */}
        {!parsing && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-fg-subtle">
            <span>支持格式：</span>
            <FormatChip icon={<FileText className="w-3 h-3" />} label="PDF/DOCX" />
            <FormatChip icon={<ImageIcon className="w-3 h-3" />} label="图片 OCR" />
            <FormatChip icon={<Code className="w-3 h-3" />} label="HTML" />
            <FormatChip icon={<FileType2 className="w-3 h-3" />} label="RTF" />
            <FormatChip icon={<ClipboardPaste className="w-3 h-3" />} label="粘贴(Ctrl+V)" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-status-red/10 border border-status-red/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-status-red shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-status-red">{error}</p>
            </div>
            <button
              onClick={() => detailsRef.current?.setAttribute('open', '')}
              className="text-xs text-status-red hover:text-status-red/80 underline shrink-0"
            >
              粘贴文本
            </button>
          </div>
        )}

        {/* Paste fallback */}
        <div className="pt-2">
          <details ref={detailsRef} className="group">
            <summary
              className="text-xs text-fg-muted cursor-pointer hover:text-fg transition-colors flex items-center gap-1 list-none"
              onClick={(e) => {
                e.preventDefault();
                const d = detailsRef.current;
                if (d) d.open = !d.open;
              }}
            >
              <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
              <span>或直接粘贴简历文本</span>
              <span className="text-fg-subtle group-open:hidden ml-1">[展开]</span>
            </summary>
            <div className="mt-3">
              <TextArea
                placeholder="粘贴简历全文..."
                rows={4}
                value={candidate?.rawText ?? ''}
                onChange={(e) => handlePasteText(e.target.value)}
                maxLength={50000}
                showCharCount
              />
            </div>
          </details>
        </div>

        {/* Parsed preview */}
        {candidate && (candidate.name || candidate.totalYears > 0 || candidate.education.length > 0) && (
          <div className="pt-3 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-fg-muted">已解析候选人</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); open(); }}
                  className="text-xs text-fg-muted hover:text-accent-gold flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> 重新上传
                </button>
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className="text-xs text-fg-muted hover:text-status-red flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> 清除
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {candidate.name && (
                <Row label="姓名">
                  <span className="text-sm font-medium text-fg">{candidate.name}</span>
                </Row>
              )}

              {candidate.birthYear && (
                <Row label="出生年">
                  <span className="text-sm text-fg">{candidate.birthYear} ({new Date().getFullYear() - candidate.birthYear} 岁)</span>
                </Row>
              )}

              {candidate.totalYears > 0 && (
                <Row label="工作年限">
                  <span className="text-sm text-fg">{candidate.totalYears.toFixed(1)} 年</span>
                </Row>
              )}

              {candidate.currentTitle && (
                <Row label="当前职位">
                  <span className="text-sm text-fg">
                    {candidate.currentTitle}
                    {candidate.currentCompany && (
                      <span className="text-fg-muted"> @ {candidate.currentCompany}</span>
                    )}
                  </span>
                </Row>
              )}

              {candidate.contact?.phone && (
                <Row label="电话">
                  <span className="text-xs text-fg-muted tabular-nums">{candidate.contact.phone}</span>
                </Row>
              )}
              {candidate.contact?.email && (
                <Row label="邮箱">
                  <span className="text-xs text-fg-muted">{candidate.contact.email}</span>
                </Row>
              )}

              {candidate.education.length > 0 && (
                <Row label="教育">
                  <div className="text-xs text-fg space-y-1">
                    {candidate.education.slice(0, 3).map((e, i) => (
                      <div key={i}>
                        {e.school} · {e.degree}
                        {e.major ? ` · ${e.major}` : ''}
                        {e.schoolTier ? <Badge color="gold" variant="soft" className="ml-2">Tier {e.schoolTier}</Badge> : null}
                      </div>
                    ))}
                  </div>
                </Row>
              )}

              {candidate.workHistory.length > 0 && (
                <Row label="工作经历">
                  <div className="text-xs text-fg space-y-1">
                    {candidate.workHistory.slice(0, 4).map((w, i) => (
                      <div key={i}>
                        <span className="text-fg">{w.company}</span>
                        {w.companyTier ? <Badge color="gold" variant="soft" className="ml-1">Tier {w.companyTier}</Badge> : null}
                        <span className="text-fg-muted"> · {w.title} · {w.startYear}-{w.endYear ?? '至今'}</span>
                      </div>
                    ))}
                  </div>
                </Row>
              )}

              {candidate.skills.length > 0 && (
                <Row label="技能">
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.skills.slice(0, 10).map((s, i) => (
                      <Badge key={i} color="gold" variant="outline">{s}</Badge>
                    ))}
                    {candidate.skills.length > 10 && (
                      <span className="text-xs text-fg-subtle self-center">+{candidate.skills.length - 10}</span>
                    )}
                  </div>
                </Row>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-medium text-fg-muted w-20 shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function FormatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-elevated border border-border">
      {icon}
      <span>{label}</span>
    </span>
  );
}
