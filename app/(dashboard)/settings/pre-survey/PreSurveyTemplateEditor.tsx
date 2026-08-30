"use client";

import { useState } from "react";
import { PreSurveyTemplate, PreSurveyQuestion } from "@/lib/db/types";
import { saveTemplateAction } from "./actions";
import { Plus, Trash2, Save, CheckCircle2, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

export default function PreSurveyTemplateEditor({
  initialTemplate,
}: {
  initialTemplate: PreSurveyTemplate;
}) {
  const [questions, setQuestions] = useState<PreSurveyQuestion[]>(
    initialTemplate.questions || []
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleAdd = () => {
    const newQ: PreSurveyQuestion = {
      id: `q_${Date.now()}`,
      question: "",
      type: "textarea",
      required: true,
      placeholder: "답변 가이드를 입력하세요...",
    };
    setQuestions([...questions, newQ]);
  };

  const handleRemove = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveTemplateAction({
        id: initialTemplate.id,
        questions,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans">
      <div className="space-y-1">
        <Link
          href="/"
          className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>대시보드로 돌아가기</span>
        </Link>
        <h1 className="text-xl font-bold text-zinc-100">사전조사 글로벌 템플릿 관리</h1>
        <p className="text-xs text-zinc-400">
          모든 신규 캠페인 생성 시 기본으로 적용되는 사전조사 질문 틀을 편집합니다.
        </p>
      </div>

      <div className="p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-100">기본 질문 목록 ({questions.length}문항)</h2>
          <button
            type="button"
            onClick={handleAdd}
            className="px-3 py-1.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>질문 추가</span>
          </button>
        </div>

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="p-5 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-500 font-bold">문항 {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(q.id)}
                  className="p-1 text-zinc-500 hover:text-red-400 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={q.question}
                  onChange={(e) => {
                    const updated = [...questions];
                    updated[idx].question = e.target.value;
                    setQuestions(updated);
                  }}
                  placeholder="질문 제목을 입력하세요..."
                  className="w-full px-3 py-2 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-100 text-xs font-bold focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={q.placeholder || ""}
                  onChange={(e) => {
                    const updated = [...questions];
                    updated[idx].placeholder = e.target.value;
                    setQuestions(updated);
                  }}
                  placeholder="플레이스홀더 예시 텍스트..."
                  className="w-full px-3 py-1.5 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-400 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-[#22242A] flex items-center justify-between">
          <div>
            {saved && (
              <span className="text-xs text-blue-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> 템플릿이 저장되었습니다!
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
            <span>템플릿 저장</span>
          </button>
        </div>
      </div>
    </div>
  );
}