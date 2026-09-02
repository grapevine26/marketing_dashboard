"use client";

import { useState } from "react";
import { SnsAccount, SnsIntakeTemplate, SnsIntakeResponse } from "@/lib/db/types";
import { submitSnsIntakeAction, assistSnsIntakeAction } from "../actions";
import {
  CheckCircle2,
  Loader2,
  Send,
  Sparkles,
  Info,
  Edit3,
  HelpCircle,
  Check,
} from "lucide-react";

export default function SnsIntakeFormClient({
  token,
  account,
  template,
  existingResponse,
}: {
  token: string;
  account: SnsAccount;
  template: SnsIntakeTemplate;
  existingResponse: SnsIntakeResponse | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    existingResponse?.answers || {}
  );
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [aiLoadingKey, setAiLoadingKey] = useState<string | null>(null);
  const [aiSuggestionsMap, setAiSuggestionsMap] = useState<
    Record<string, string[]>
  >({});

  const handleAiAssist = async (questionId: string, questionText: string) => {
    setAiLoadingKey(questionId);
    try {
      const res = await assistSnsIntakeAction({
        question: questionText,
        userDraft: answers[questionId],
        context: {
          companyName: account.company_name,
          platform: account.platform,
          handle: account.handle,
        },
      });

      if (res.recommendedDraft) {
        setAnswers((prev) => ({
          ...prev,
          [questionId]: res.recommendedDraft,
        }));
      }
      if (res.suggestions && res.suggestions.length > 0) {
        setAiSuggestionsMap((prev) => ({
          ...prev,
          [questionId]: res.suggestions,
        }));
      }
    } catch (err) {
      console.error(err);
      alert("AI 추천 답변 생성 중 오류가 발생했습니다.");
    } finally {
      setAiLoadingKey(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitSnsIntakeAction({
        token,
        accountId: account.id,
        answers,
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert("설문 제출 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center space-y-3 bg-[#090A0C] rounded-2xl border border-emerald-500/30 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-zinc-100">
            사전설문 제출이 성공적으로 완료되었습니다!
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
            보내주신 소중한 답변을 바탕으로 브랜드에 최적화된 매력적이고 감각적인 SNS 콘텐츠를 기획하겠습니다.
          </p>
        </div>

        {/* Submitted Answers Summary */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            제출된 답변 요약
          </h3>
          <div className="space-y-3 divide-y divide-[#22242A]">
            {template.questions.map((q, idx) => (
              <div key={q.id} className={idx > 0 ? "pt-3 space-y-1" : "space-y-1"}>
                <div className="text-xs font-semibold text-sky-400">
                  {idx + 1}. {q.question}
                </div>
                <div className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed pl-2 border-l-2 border-[#292B34]">
                  {answers[q.id] || "(답변 없음)"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="w-full py-3 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-300 text-xs font-semibold border border-[#22242A] inline-flex items-center justify-center gap-1.5 transition"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>답변 내용 다시 수정하기</span>
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {existingResponse && (
        <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0 text-sky-400" />
          <span>이전에 제출하신 답변이 등록되어 있습니다. 필요한 항목을 수정하여 다시 제출하실 수 있습니다.</span>
        </div>
      )}

      <div className="space-y-6">
        {template.questions.map((q, idx) => {
          const isAiLoading = aiLoadingKey === q.id;
          const suggestions = aiSuggestionsMap[q.id];

          return (
            <div
              key={q.id}
              className="p-4 sm:p-5 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3 focus-within:border-sky-500/50 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs sm:text-sm font-bold text-zinc-200 flex items-start gap-1.5">
                  <span className="text-sky-400 font-mono">{idx + 1}.</span>
                  <span>
                    {q.question} {q.required && <strong className="text-rose-400">*</strong>}
                  </span>
                </label>

                {/* Gemini AI Auto-Assist Button */}
                <button
                  type="button"
                  disabled={isAiLoading}
                  onClick={() => handleAiAssist(q.id, q.question)}
                  className="px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 text-[11px] font-semibold inline-flex items-center gap-1 transition active:scale-95 shrink-0 self-start sm:self-auto"
                  title="Gemini AI가 브랜드에 어울리는 답변 초안을 작성해 드립니다"
                >
                  {isAiLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>AI 추천 답변</span>
                </button>
              </div>

              {/* Suggestions chips if generated */}
              {suggestions && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {suggestions.map((sug, sIdx) => (
                    <span
                      key={sIdx}
                      className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] font-medium"
                    >
                      💡 {sug}
                    </span>
                  ))}
                </div>
              )}

              <textarea
                required={q.required}
                rows={3}
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                placeholder={q.placeholder || "상세한 내용을 입력해주세요."}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs sm:text-sm focus:outline-none focus:border-sky-500 leading-relaxed placeholder:text-zinc-600 resize-y"
              />
            </div>
          );
        })}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-bold shadow-xl transition active:scale-98 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        <span>{existingResponse ? "설문 답변 수정하여 다시 제출" : "사전설문 제출하기"}</span>
      </button>
    </form>
  );
}