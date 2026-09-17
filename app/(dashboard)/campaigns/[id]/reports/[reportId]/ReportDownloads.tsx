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
  pdfEmojiCount = 0,
}: {
  reportId: string;
  templates: ReportTemplateOption[];
  defaultTemplateId: string;
  /**
   * 제목·총평에 든 이모지 글자 수. PDF 한글 글꼴에는 이모지 글리프가 없어 **빈칸으로 나간다**
   * (lib/reports/pdf.ts 에서 그리기 직전에 걸러낸다).
   *
   * **왜 여기서도 알리나** — 총평을 저장할 때 한 번 알리지만(CustomSectionEditor), 실제로 PDF 를
   * 받는 사람은 며칠 뒤의 다른 담당자일 수 있다. 다운로드 응답은 파일이라 말을 붙일 자리가 없으므로,
   * 누르기 직전인 이 자리에 남겨 둔다.
   */
  pdfEmojiCount?: number;
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
      {pdfEmojiCount > 0 && (
        <p className="text-[11px] text-warn-soft text-right max-w-xs">
          이모지 {pdfEmojiCount}자는 PDF 에서 빠집니다. (PDF 한글 글꼴에 이모지 글자가 없습니다 · PPTX 에는 그대로 나옵니다)
        </p>
      )}
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
