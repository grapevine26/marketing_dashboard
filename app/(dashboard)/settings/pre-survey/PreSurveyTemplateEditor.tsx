"use client";

import { useState } from "react";
import { PreSurveyTemplate, PreSurveyQuestion } from "@/lib/db/types";
import { saveTemplateAction } from "./actions";
import { Plus, Trash2, Save, Check } from "lucide-react";

export default function PreSurveyTemplateEditor({
  initialTemplate,
}: {
  initialTemplate: PreSurveyTemplate;
}) {
  const [questions, setQuestions] = useState<PreSurveyQuestion[]>(
    initialTemplate.questions || []
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const addQuestion = () => {
    const newQ: PreSurveyQuestion = {
      id: "q_" + Date.now(),
      question: "",
      type: "textarea",
      required: true,
      placeholder: "",
    };
    setQuestions([...questions, newQ]);
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, patch: Partial<PreSurveyQuestion>) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    await saveTemplateAction({ id: 1, questions });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">사전 질문 목록 ({questions.length}개)</h2>
          <button
            type="button"
            onClick={addQuestion}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>질문 추가</span>
          </button>
        </div>

        {questions.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">등록된 질문이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-blue-400">질문 #{idx + 1}</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                      />
                      <span>필수 질문</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeQuestion(q.id)}
                      className="p-1 rounded text-slate-400 hover:text-red-400 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={q.question}
                  onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                  placeholder="질문 내용을 입력하세요"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                />

                <input
                  type="text"
                  value={q.placeholder || ""}
                  onChange={(e) => updateQuestion(q.id, { placeholder: e.target.value })}
                  placeholder="광고주 입력 안내 가이드(Placeholder)"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
          </div>
        )}

        <div className="pt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md transition disabled:opacity-50"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>저장 완료!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{saving ? "저장 중..." : "템플릿 저장하기"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}