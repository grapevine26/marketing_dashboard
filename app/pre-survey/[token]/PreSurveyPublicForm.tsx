"use client";

import { useState } from "react";
import { Campaign, PreSurveyTemplate, PreSurveyResponse } from "@/lib/db/types";
import { submitPublicPreSurveyAction, getPublicAiAssistAction } from "./actions";
import { Sparkles, Send, CheckCircle2, Loader2 } from "lucide-react";

export default function PreSurveyPublicForm({
  campaign,
  template,
  initialResponse,
}: {
  campaign: Campaign;
  template: PreSurveyTemplate;
  initialResponse: PreSurveyResponse | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    initialResponse?.answers || {}
  );
  const [loadingAi, setLoadingAi] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleAiAssist = async (questionId: string, questionText: string) => {
    setLoadingAi(questionId);
    try {
      const res = await getPublicAiAssistAction({
        question: questionText,
        userDraft: answers[questionId] || "",
        campaignName: campaign.name,
        companyName: campaign.company_name,
        campaignType: campaign.campaign_type,
      });

      setAiSuggestions((prev) => ({
        ...prev,
        [questionId]: res.suggestions,
      }));

      if (res.recommendedDraft) {
        setAnswers((prev) => ({
          ...prev,
          [questionId]: res.recommendedDraft,
        }));
      }
    } finally {
      setLoadingAi(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitPublicPreSurveyAction({
        token: campaign.pre_survey_token,
        answers,
        usedAiAssist: Object.keys(aiSuggestions).length > 0,
      });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4 shadow-xl">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-white">사전조사 제출이 완료되었습니다!</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          작성해주신 소중한 요구사항을 바탕으로 인플루언서 모집 신청폼 및 매칭 가이드를 준비하겠습니다.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 shadow-2xl"
    >
      {template.questions.map((q, idx) => (
        <div key={q.id} className="space-y-2.5 pb-6 border-b border-slate-800 last:border-0 last:pb-0">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-sm font-semibold text-slate-200">
              <span className="text-blue-400 mr-1.5">Q{idx + 1}.</span>
              {q.question}
              {q.required && <span className="text-red-400 ml-1">*</span>}
            </label>

            <button
              type="button"
              disabled={loadingAi === q.id}
              onClick={() => handleAiAssist(q.id, q.question)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition disabled:opacity-50"
            >
              {loadingAi === q.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              )}
              <span>AI 작성 도움</span>
            </button>
          </div>

          <textarea
            required={q.required}
            rows={3}
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            placeholder={q.placeholder || "답변 내용을 상세히 적어주세요."}
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition"
          />

          {aiSuggestions[q.id] && (
            <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-900/30 space-y-1.5">
              <div className="text-[11px] font-semibold text-indigo-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> 추천 키워드 / 포인트:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {aiSuggestions[q.id].map((sug, sIdx) => (
                  <span
                    key={sIdx}
                    className="px-2 py-0.5 rounded-md bg-indigo-900/40 text-indigo-200 text-xs"
                  >
                    {sug}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/25 transition disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>제출 중...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>답변 제출하기</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}