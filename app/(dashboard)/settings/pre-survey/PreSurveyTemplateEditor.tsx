"use client";

import { useState } from "react";
import { PreSurveyTemplate, PreSurveyQuestion } from "@/lib/db/types";
import { saveTemplateAction } from "./actions";
import {
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Loader2,
  HelpCircle,
  MessageSquareText,
  FileQuestion,
  Sparkles,
  GripVertical,
  Check,
} from "lucide-react";

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
      placeholder: "예: 구체적인 답변 가이드 또는 예시를 작성하세요...",
    };
    setQuestions([...questions, newQ]);
  };

  const handleRemove = (id: string) => {
    if (questions.length <= 1) {
      alert("최소 1개 이상의 사전조사 질문이 필요합니다.");
      return;
    }
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
    <div className="space-y-6 font-sans">
      {/* Question List Card Container */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-6 shadow-2xl">
        {/* Header inside container */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#22242A]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              <FileQuestion className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <span>표준 사전조사 문항</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold">
                  총 {questions.length}개 문항
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                광고주가 사전조사 링크를 열었을 때 순서대로 보여지는 질문과 입력 예시입니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className="px-4 py-2.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 hover:border-blue-500/60 text-blue-400 text-xs font-bold inline-flex items-center gap-1.5 transition shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>새 질문 문항 추가</span>
          </button>
        </div>

        {/* Question Cards List */}
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="group p-5 sm:p-6 rounded-2xl bg-[#090A0C] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#0D0E12] transition-all space-y-4 shadow-md"
            >
              {/* Top row of card: Q badge + Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-blue-600 text-white text-xs font-extrabold shadow-sm">
                    Q{idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    문항 {idx + 1}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => {
                        const updated = [...questions];
                        updated[idx].required = e.target.checked;
                        setQuestions(updated);
                      }}
                      className="accent-blue-600 w-3.5 h-3.5 rounded"
                    />
                    <span>필수 응답</span>
                  </label>

                  <button
                    type="button"
                    title="문항 삭제"
                    onClick={() => handleRemove(q.id)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Input Fields with clear visual hierarchies */}
              <div className="space-y-3.5">
                {/* 1. Question Title Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <MessageSquareText className="w-3.5 h-3.5 text-blue-400" />
                    <span>질문 제목 (광고주에게 전달될 질문)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={q.question}
                    onChange={(e) => {
                      const updated = [...questions];
                      updated[idx].question = e.target.value;
                      setQuestions(updated);
                    }}
                    placeholder="예: 이번 캠페인에서 홍보하고자 하는 제품/서비스의 핵심 특징은 무엇인가요?"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs font-semibold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition placeholder:text-zinc-600"
                  />
                </div>

                {/* 2. Placeholder / Guide Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
                    <span>답변 작성 가이드 및 예시 텍스트 (플레이스홀더)</span>
                  </label>
                  <input
                    type="text"
                    value={q.placeholder || ""}
                    onChange={(e) => {
                      const updated = [...questions];
                      updated[idx].placeholder = e.target.value;
                      setQuestions(updated);
                    }}
                    placeholder="예: 히알루론산 10중 배합으로 72시간 지속되는 강력한 수분 보습력"
                    className="w-full px-4 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-300 text-xs focus:outline-none focus:border-blue-500 transition placeholder:text-zinc-600"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Action Footer */}
        <div className="pt-4 border-t border-[#22242A] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            {saved ? (
              <span className="text-xs text-blue-400 font-bold flex items-center gap-1.5 animate-pulse">
                <CheckCircle2 className="w-4 h-4" /> 기본 템플릿이 성공적으로 저장되었습니다!
              </span>
            ) : (
              <span className="text-xs text-zinc-500">
                저장 후 생성되는 신규 시딩 캠페인부터 본 템플릿이 즉시 적용됩니다.
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition disabled:opacity-50 inline-flex items-center justify-center gap-2 shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>템플릿 저장하기</span>
          </button>
        </div>
      </div>
    </div>
  );
}