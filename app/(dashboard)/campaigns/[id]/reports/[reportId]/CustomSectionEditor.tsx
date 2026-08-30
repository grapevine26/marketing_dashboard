"use client";

import { useState } from "react";
import { CustomSection } from "@/lib/db/types";
import { saveReportSectionsAction } from "../actions";
import { Plus, Trash2, Save, CheckCircle2, Loader2 } from "lucide-react";

export default function CustomSectionEditor({
  reportId,
  campaignId,
  initialSections,
}: {
  reportId: string;
  campaignId: string;
  initialSections: CustomSection[];
}) {
  const [sections, setSections] = useState<CustomSection[]>(initialSections);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleAdd = () => {
    setSections([
      ...sections,
      {
        id: `sec_${Date.now()}`,
        title: "새 섹션 제목",
        content: "내용을 입력하세요...",
      },
    ]);
  };

  const handleRemove = (id: string) => {
    setSections(sections.filter((s) => s.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveReportSectionsAction({
        reportId,
        campaignId,
        customSections: sections,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-6 shadow-xl font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-100">결과보고서 커스텀 총평 및 하이라이트 편집</h2>
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 py-1.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>섹션 추가</span>
        </button>
      </div>

      <div className="space-y-4">
        {sections.map((sec, idx) => (
          <div
            key={sec.id}
            className="p-5 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3"
          >
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={sec.title}
                onChange={(e) => {
                  const updated = [...sections];
                  updated[idx].title = e.target.value;
                  setSections(updated);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-100 text-xs font-bold focus:outline-none focus:border-blue-500 w-2/3"
              />
              <button
                type="button"
                onClick={() => handleRemove(sec.id)}
                className="p-1 text-zinc-500 hover:text-red-400 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={4}
              value={sec.content}
              onChange={(e) => {
                const updated = [...sections];
                updated[idx].content = e.target.value;
                setSections(updated);
              }}
              className="w-full px-3 py-2 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
            />
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-[#22242A] flex items-center justify-between">
        <div>
          {saved && (
            <span className="text-xs text-blue-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> 저장되었습니다!
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>보고서 내용 저장</span>
        </button>
      </div>
    </div>
  );
}