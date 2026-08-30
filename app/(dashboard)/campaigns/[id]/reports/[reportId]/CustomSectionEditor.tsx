"use client";

import { useState } from "react";
import { CustomSection } from "@/lib/db/types";
import { saveReportSectionsAction } from "../actions";
import { Plus, Trash2, Save, Check } from "lucide-react";

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

  const addSection = () => {
    const newSec: CustomSection = {
      id: "sec_" + Date.now(),
      title: "새 섹션 제목 (예: 정성 피드백 분석)",
      content: "",
    };
    setSections([...sections, newSec]);
  };

  const removeSection = (id: string) => {
    setSections(sections.filter((s) => s.id !== id));
  };

  const updateSection = (id: string, patch: Partial<CustomSection>) => {
    setSections(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleSave = async () => {
    setSaving(true);
    await saveReportSectionsAction({
      reportId,
      campaignId,
      customSections: sections,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">커스텀 리포트 섹션 & 총평 편집</h2>
          <p className="text-xs text-slate-400">
            PDF 및 PPTX 다운로드 시 포함될 상세 코멘트 및 분석 내용을 편집합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={addSection}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>섹션 추가</span>
        </button>
      </div>

      <div className="space-y-4">
        {sections.map((sec) => (
          <div
            key={sec.id}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={sec.title}
                onChange={(e) => updateSection(sec.id, { title: e.target.value })}
                placeholder="섹션 제목"
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => removeSection(sec.id)}
                className="p-1 rounded text-slate-500 hover:text-red-400 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={3}
              value={sec.content}
              onChange={(e) => updateSection(sec.id, { content: e.target.value })}
              placeholder="상세 분석 내용 또는 마케팅 총평을 입력하세요."
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
        >
          {saved ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-300" />
              <span>저장 완료!</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "저장 중..." : "섹션 변경사항 저장"}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}