"use client";

import { useState } from "react";
import { CustomSection } from "@/lib/db/types";
import { saveReportSectionsAction } from "../actions";
import { Plus, Trash2, Save, CheckCircle2, Loader2 } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";

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
  const [error, setError] = useState<string | null>(null);

  const update = (id: string, patch: Partial<CustomSection>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const handleAdd = () => {
    setSections((prev) => [
      ...prev,
      { id: `sec_${Date.now()}`, title: "새 섹션 제목", content: "" },
    ]);
  };

  const handleRemove = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await safeCall(saveReportSectionsAction({ reportId, campaignId, customSections: sections }));
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-8 rounded-3xl bg-surface border border-border space-y-6 shadow-xl font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text">결과보고서 커스텀 총평 및 하이라이트 편집</h2>
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text text-xs font-semibold inline-flex items-center gap-1 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>섹션 추가</span>
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}

      <div className="space-y-4">
        {sections.length === 0 && (
          <div className="p-6 text-center text-text-muted text-xs border border-dashed border-border rounded-xl bg-bg">
            섹션이 없습니다. 섹션 추가 버튼으로 총평을 작성하세요.
          </div>
        )}
        {sections.map((sec) => (
          <div key={sec.id} className="p-5 rounded-2xl bg-bg border border-border space-y-3">
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={sec.title}
                onChange={(e) => update(sec.id, { title: e.target.value })}
                className="px-3 py-1.5 rounded-lg bg-surface border border-border text-text text-xs font-bold focus:outline-none focus:border-blue-500 w-2/3"
              />
              <button type="button" onClick={() => handleRemove(sec.id)} className="p-1 text-text-muted hover:text-red-400 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={4}
              value={sec.content}
              onChange={(e) => update(sec.id, { content: e.target.value })}
              placeholder="내용을 입력하세요..."
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
            />
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-border flex items-center justify-between">
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
