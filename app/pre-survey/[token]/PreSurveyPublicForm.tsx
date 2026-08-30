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
  const [loadingAiMap, setLoadingAiMap] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleAiAssist = async (questionId: string, questionText: string) => {
    setLoadingAiMap((prev) => ({ ...prev, [questionId]: true }));
    try {
      const res = await getPublicAiAssistAction({
        question: questionText,
        userDraft: answers[questionId] || "",
        campaignName: campaign.name,
        companyName: campaign.company_name,
        campaignType: campaign.campaign_type,
      });

      if (res.recommendedDraft) {
        setAnswers((prev) => ({ ...prev, [questionId]: res.recommendedDraft }));
      }
    } finally {
      setLoadingAiMap((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitPublicPreSurveyAction({
        token: campaign.pre_survey_token,
        answers,
        usedAiAssist: true,
      });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-8 rounded-3xl bg-[#131418] border border-[#22242A] text-center space-y-3 shadow-2xl font-sans">
        <div className="w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-zinc-100">사전조사서가 성공적으로 제출되었습니다!</h2>
        <p className="text-xs text-zinc-400">
          입력해주신 내용을 바탕으로 에이전시 전담 매니저가 인플루언서 모집을 시작합니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-6 shadow-2xl font-sans">
      <div className="space-y-5 divide-y divide-[#22242A]">
        {template.questions.map((q, idx) => (
          <div key={q.id} className={idx > 0 ? "pt-5 space-y-2" : "space-y-2"}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-200">
                {idx + 1}. {q.question} {q.required && <span className="text-blue-400">*</span>}
              </label>
              <button
                type="button"
                disabled={loadingAiMap[q.id]}
                onClick={() => handleAiAssist(q.id, q.question)}
                className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-[11px] font-semibold transition inline-flex items-center gap-1"
              >
                {loadingAiMap[q.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>AI 추천받기</span>
              </button>
            </div>

            <textarea
              rows={3}
              required={q.required}
              value={answers[q.id] || ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              placeholder={q.placeholder || "내용을 입력하세요..."}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
            />
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        <span>사전조사 제출 완료하기</span>
      </button>
    </form>
  );
}