// =====================================================
// Module 4: 上传简历
// =====================================================
import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, AlertCircle, Loader2, X, RefreshCw, ChevronDown } from 'lucide-react';
import { Card, CardHeader, CardBody, TextArea, Badge, Button } from '@/components/ui/Card';
import { parseResume, parseResumeText } from '@/lib/parseResume';
import type { Candidate } from '@/types';

type Props = {
  value: Candidate | null;
  onChange: (value: Candidate | null) => void;
};

export function ResumeUploadModule({ value, onChange }: Props) {
  const candidate = value;
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setParsing(true);
    try {
      const parsed = await parseResume(file);
      onChange(parsed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`简历解析失败: ${msg}。建议尝试粘贴文本方式。`);
    } finally {
      setParsing(false);
    }
  }, [onChange]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt', '.md'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
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

  return (
    <Card>
      <CardHeader
        icon={<Upload className="w-5 h-5" />}
        title="上传简历"
        subtitle="支持 PDF / DOCX / TXT，客户端解析不上传服务器"
      />

      <CardBody className="space-y-4">
        {/* Dropzone - 整块可点 + 显式选择按钮 */}
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
              <p className="text-sm text-fg-muted">正在解析简历...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-8 h-8 text-fg-muted" />
              <div>
                <p className="text-sm text-fg font-medium">
                  {isDragActive ? '松开以上传' : '拖入简历文件 或 点击选择'}
                </p>
                <p className="text-xs text-fg-subtle mt-1">PDF / DOCX / TXT · 最大 10MB</p>
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