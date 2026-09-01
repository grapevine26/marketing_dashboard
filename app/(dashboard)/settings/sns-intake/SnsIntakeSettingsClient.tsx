"use client";

import { useState } from "react";
import { SnsIntakeTemplate, PreSurveyQuestion } from "@/lib/db/types";
import { updateSnsIntakeTemplateAction } from "../../sns/actions";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";

export default function SnsIntakeSettingsClient({
  initialTemplate,
}: {
  initialTemplate: SnsIntakeTemplate;
}) {
  const [questions, setQuestions] = useState<PreSurveyQuestion[]>(initialTemplate.questions);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleAddQuestion = () => {
    const newQ: PreSurveyQuestion = {
      id: `sq_${Date.now()}`,
      question: "",
      required: true,
      placeholder: "",
    };
    setQuestions([...questions, newQ]);
  };

  const handleUpdate = (id: string, patch: Partial<PreSurveyQuestion>) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const handleDelete = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSnsIntakeTemplateAction(questions);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-zinc-100">설문 질문 목록 ({questions.length})</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddQuestion}
            className="px-3 py-1.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>질문 추가</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1 shadow-md transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>저장하기</span>
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
          SNS 사전설문 질문틀이 성공적으로 저장되었습니다.
        </div>
      )}

      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div key={q.id} className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-400">질문 {idx + 1}</span>
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => handleUpdate(q.id, { required: e.target.checked })}
                    className="w-3.5 h-3.5 accent-sky-500 rounded"
                  />
                  <span>필수 입력</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleDelete(q.id)}
                  className="text-zinc-500 hover:text-red-400 p-1 rounded"
                >
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
                className="w-full px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500 font-medium"
              />
              <input
                type="text"
                value={q.placeholder || ""}
                onChange={(e) => handleUpdate(q.id, { placeholder: e.target.value })}
                placeholder="입력 예시 (Placeholder)"
                className="w-full px-3 py-1.5 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-400 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}