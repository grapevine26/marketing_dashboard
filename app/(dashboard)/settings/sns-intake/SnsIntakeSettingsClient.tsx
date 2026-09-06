"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SnsIntakeTemplate, PreSurveyQuestion } from "@/lib/db/types";
import { updateSnsIntakeTemplateAction } from "../../sns/actions";
import { Plus, Trash2, Save, Loader2, ArrowUp, ArrowDown } from "lucide-react";

export default function SnsIntakeSettingsClient({ initialTemplate }: { initialTemplate: SnsIntakeTemplate }) {
  const router = useRouter();
  const [questions, setQuestions] = useState<PreSurveyQuestion[]>(initialTemplate.questions);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, { id: `sq_${Date.now()}`, question: "", required: true, placeholder: "" }]);
  };

  const handleUpdate = (id: string, patch: Partial<PreSurveyQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const handleDelete = (id: string) => {
    if (questions.length <= 1) {
      setError("최소 1개 이상의 질문이 필요합니다.");
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const move = (idx: number, dir: -1 | 1) =>
    setQuestions((prev) => {
      const next = [...prev];
      const t = idx + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[idx], next[t]] = [next[t], next[idx]];
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await updateSnsIntakeTemplateAction(questions);
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setQuestions(res.data.questions);
    router.refresh();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="p-6 rounded-3xl bg-surface border border-border space-y-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-text">설문 질문 목록 ({questions.length})</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleAddQuestion} className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text text-xs font-semibold inline-flex items-center gap-1 transition">
            <Plus className="w-3.5 h-3.5" />
            <span>질문 추가</span>
          </button>
          <button type="button" disabled={saving} onClick={handleSave} className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1 shadow-md transition disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>저장하기</span>
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
      {savedNotice && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">SNS 사전설문 질문틀이 저장되었습니다.</div>}

      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div key={q.id} className="p-4 rounded-2xl bg-bg border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-sky-400">질문 {idx + 1}</span>
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 text-text-muted hover:text-text disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => move(idx, 1)} disabled={idx === questions.length - 1} className="p-1 text-text-muted hover:text-text disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-text-sub flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={q.required} onChange={(e) => handleUpdate(q.id, { required: e.target.checked })} className="w-3.5 h-3.5 accent-sky-500 rounded" />
                  <span>필수 입력</span>
                </label>
                <button type="button" onClick={() => handleDelete(q.id)} className="text-text-muted hover:text-red-400 p-1 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={q.question}
                onChange={(e) => handleUpdate(q.id, { question: e.target.value })}
                placeholder="질문 내용을 입력하세요"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text text-xs focus:outline-none focus:border-sky-500 font-medium"
              />
              <input
                type="text"
                value={q.placeholder || ""}
                onChange={(e) => handleUpdate(q.id, { placeholder: e.target.value })}
                placeholder="입력 예시 (Placeholder)"
                className="w-full px-3 py-1.5 rounded-xl bg-surface border border-border text-text-sub text-xs focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
