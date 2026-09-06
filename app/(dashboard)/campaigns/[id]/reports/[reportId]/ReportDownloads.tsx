"use client";

import { useState } from "react";
import DownloadFileButton from "@/components/DownloadFileButton";

export interface ReportTemplateOption {
  id: string;
  name: string;
  builtin: boolean;
  placeholders: string[];
}

export default function ReportDownloads({
  reportId,
  templates,
  defaultTemplateId,
}: {
  reportId: string;
  templates: ReportTemplateOption[];
  defaultTemplateId: string;
}) {
  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const selected = templates.find((t) => t.id === templateId);
  const hasTable = selected?.placeholders.includes("표:인플루언서");
  const hasChart = selected?.placeholders.includes("차트:성과");

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <DownloadFileButton
          href={`/api/reports/${reportId}/pdf`}
          label="PDF 보고서 다운로드"
          fallbackFilename="report.pdf"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
        />
        <DownloadFileButton
          href={`/api/reports/${reportId}/pptx?template=${encodeURIComponent(templateId)}`}
          label="PPTX 슬라이드 다운로드"
          fallbackFilename="report.pptx"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
        />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-text-sub">
        <span>PPT 템플릿</span>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="px-2 py-1 rounded-lg bg-bg border border-border text-text text-[11px] focus:outline-none focus:border-orange-500"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.builtin ? "[기본] " : ""}{t.name}</option>
          ))}
        </select>
        {selected && !selected.builtin && (
          <span className="text-text-muted">
            표 {hasTable ? "포함" : "없음"} · 차트 {hasChart ? "포함" : "없음"}
          </span>
        )}
      </div>
    </div>
  );
}
