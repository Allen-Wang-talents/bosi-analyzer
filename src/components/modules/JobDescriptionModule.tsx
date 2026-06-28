// =====================================================
// Module 2: 岗位 JD
// =====================================================
import { useMemo } from 'react';
import { FileText, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardBody, TextArea, Badge } from '@/components/ui/Card';
import type { JD } from '@/types';

type Props = {
  value: JD | null;
  onChange: (value: JD | null) => void;
};

export function JobDescriptionModule({ value, onChange }: Props) {
  const jd = value ?? {
    rawText: '',
    title: '',
    responsibilities: [],
    mustHaveSkills: [],
    niceToHaveSkills: [],
    minYears: 0,
    location: '',
  };

  const handleTextChange = (text: string) => {
    // 立即更新原文，不做实时解析（避免输入卡顿）
    onChange({ ...jd, rawText: text });
  };

  // 显示已解析的字段（如果有）
  const hasParsed = jd.title || jd.mustHaveSkills.length > 0 || jd.responsibilities.length > 0;

  return (
    <Card>
      <CardHeader
        icon={<FileText className="w-5 h-5" />}
        title="岗位 JD"
        subtitle="粘贴完整 JD，自动提取关键信息"
      />

      <CardBody>
        <TextArea
          label="JD 全文"
          placeholder={`粘贴 JD 文本，建议包含：
· 职位名称
· 工作职责
· 任职要求（必须技能）
· 加分项
· 工作地点 / 薪资范围
· 经验年限要求`}
          rows={10}
          value={jd.rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          showCharCount
          maxLength={10000}
        />

        {hasParsed && (
          <div className="mt-5 pt-5 border-t border-border space-y-3">
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <Sparkles className="w-3.5 h-3.5 text-accent-gold" />
              <span>已自动提取：</span>
            </div>

            {jd.title && (
              <Row label="职位">
                <span className="text-sm text-fg font-medium">{jd.title}</span>
              </Row>
            )}

            {jd.minYears > 0 && (
              <Row label="经验要求">
                <span className="text-sm text-fg">{jd.minYears}+ 年</span>
              </Row>
            )}

            {jd.location && (
              <Row label="工作地点">
                <span className="text-sm text-fg">{jd.location}</span>
              </Row>
            )}

            {jd.compRange && (
              <Row label="薪资范围">
                <span className="text-sm text-fg">
                  {jd.compRange.min / 1000}K - {jd.compRange.max / 1000}K
                </span>
              </Row>
            )}

            {jd.industry && (
              <Row label="行业">
                <span className="text-sm text-fg">{jd.industry}</span>
              </Row>
            )}

            {jd.mustHaveSkills.length > 0 && (
              <Row label="必须技能">
                <div className="flex flex-wrap gap-1.5">
                  {jd.mustHaveSkills.slice(0, 15).map((s, i) => (
                    <Badge key={i} color="red" variant="soft">{s}</Badge>
                  ))}
                </div>
              </Row>
            )}

            {jd.niceToHaveSkills.length > 0 && (
              <Row label="加分技能">
                <div className="flex flex-wrap gap-1.5">
                  {jd.niceToHaveSkills.slice(0, 10).map((s, i) => (
                    <Badge key={i} color="gold" variant="soft">{s}</Badge>
                  ))}
                </div>
              </Row>
            )}

            {jd.responsibilities.length > 0 && (
              <Row label="工作职责">
                <ul className="text-xs text-fg-muted space-y-1">
                  {jd.responsibilities.slice(0, 4).map((r, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-accent-gold">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                  {jd.responsibilities.length > 4 && (
                    <li className="text-fg-subtle">... 共 {jd.responsibilities.length} 条</li>
                  )}
                </ul>
              </Row>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-medium text-fg-muted w-20 shrink-0 pt-1">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}