"use client";

import { useState } from "react";
import { PublicCampaign, PreSurveyTemplate } from "@/lib/db/types";
import { submitPublicPreSurveyAction, getPublicAiAssistAction } from "./actions";
import { Sparkles, Send, CheckCircle2, Loader2, Edit3 } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";

const MAX_AI_ATTEMPTS = 3;

export default function PreSurveyPublicForm({
  token,
  campaign,
  template,
  initialAnswers,
  initialAiUsage,
}: {
  token: string;
  campaign: PublicCampaign;
  template: PreSurveyTemplate;
  initialAnswers: Record<string, string> | null;
  initialAiUsage?: Record<string, number>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers || {});
  const [loadingAiMap, setLoadingAiMap] = useState<Record<string, boolean>>({});
  const [aiUsageMap, setAiUsageMap] = useState<Record<string, number>>(initialAiUsage || {});
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [usedAi, setUsedAi] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleAiAssist = async (questionId: string) => {
    const currentUsage = aiUsageMap[questionId] || 0;
    if (currentUsage >= MAX_AI_ATTEMPTS) {
      setNotice("이 질문의 AI 추천을 모두 사용했습니다 (최대 3회).");
      return;
    }

    const currentText = answers[questionId]?.trim() || "";
    const isRegen = currentUsage > 0 || (Boolean(currentText) && Boolean(suggestions[questionId]));

    setLoadingAiMap((prev) => ({ ...prev, [questionId]: true }));
    setError(null);
    setNotice(null);

    const res = await safeCall(
      getPublicAiAssistAction({
        token,
        questionId,
        userDraft: isRegen ? undefined : currentText,
        previousDraft: isRegen ? currentText : undefined,
        forceRefresh: isRegen,
        isRegeneration: isRegen,
      })
    );
    setLoadingAiMap((prev) => ({ ...prev, [questionId]: false }));
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.data.fallback) {
      setNotice("AI 제안 실패 — 직접 입력해주세요.");
      return;
    }

    const newUsage =
      typeof res.data.remainingAttempts === "number"
        ? MAX_AI_ATTEMPTS - res.data.remainingAttempts
        : currentUsage + 1;

    setUsedAi(true);
    setAiUsageMap((prev) => ({ ...prev, [questionId]: newUsage }));
    setAnswers((prev) => ({ ...prev, [questionId]: res.data.recommendedDraft }));
    setSuggestions((prev) => ({ ...prev, [questionId]: res.data.suggestions }));

    if (newUsage >= MAX_AI_ATTEMPTS) {
      setNotice("이 질문의 AI 추천 횟수(최대 3회)를 모두 사용했습니다. 필요 시 직접 문구를 수정해 주세요.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await safeCall(submitPublicPreSurveyAction({ token, answers, usedAiAssist: usedAi, honeypot }));
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border text-center space-y-4 shadow-2xl font-sans">
        <div className="w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-base sm:text-lg font-bold text-text">사전조사서가 성공적으로 제출되었습니다!</h2>
        <p className="text-xs text-text-sub leading-relaxed">
          입력해주신 내용을 바탕으로 {campaign.company_name} 담당 매니저가 인플루언서 모집을 시작합니다.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-semibold border border-border inline-flex items-center gap-1.5"
        >
          <Edit3 className="w-3.5 h-3.5" /> 답변 수정하기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl bg-surface border border-border space-y-6 shadow-2xl font-sans">
      {initialAnswers && (
        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs">
          이전에 제출한 답변이 있습니다. 수정 후 다시 제출하면 덮어씁니다.
        </div>
      )}
      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn-soft text-xs font-semibold">{notice}</div>}

      <div className="space-y-5 divide-y divide-border">
        {template.questions.map((q, idx) => {
          const usage = aiUsageMap[q.id] || 0;
          const isMax = usage >= MAX_AI_ATTEMPTS;
          const remaining = Math.max(0, MAX_AI_ATTEMPTS - usage);

          return (
            <div key={q.id} className={idx > 0 ? "pt-5 space-y-2.5" : "space-y-2.5"}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-text">
                  {idx + 1}. {q.question} {q.required && <span className="text-blue-400">*</span>}
                </label>
                <button
                  type="button"
                  disabled={loadingAiMap[q.id] || isMax}
                  onClick={() => handleAiAssist(q.id)}
                  className={`self-start sm:self-auto px-2.5 py-1.5 sm:py-1 rounded-lg text-[11px] font-semibold transition active:scale-95 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isMax
                      ? "bg-surface2 text-text-muted border border-border"
                      : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20"
                  }`}
                  title={isMax ? "최대 추천 횟수(3회)를 모두 사용했습니다." : undefined}
                >
                  {loadingAiMap[q.id] ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isMax ? (
                    <CheckCircle2 className="w-3 h-3 text-text-muted" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>
                    {isMax
                      ? "추천 한도 완료 (3/3회)"
                      : usage > 0
                        ? `다른 추천받기 (${remaining}회 남음)`
                        : answers[q.id]?.trim()
                          ? "AI 초안 다듬기 (3회 가능)"
                          : "AI 추천받기 (3회 가능)"}
                  </span>
                </button>
              </div>

              {suggestions[q.id]?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions[q.id].map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px]">💡 {s}</span>
                  ))}
                </div>
              ) : null}

              <textarea
                rows={3}
                required={q.required}
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                placeholder={q.placeholder || "내용을 입력하세요..."}
                className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>
          );
        })}
      </div>

      {/* 허니팟 숨김 필드 (봇 스팸 방어) */}
      <div style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
        <label htmlFor="presurvey_hp_website">웹사이트 (비워두세요)</label>
        <input
          id="presurvey_hp_website"
          type="text"
          name="presurvey_hp_website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3.5 sm:py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/25 transition disabled:opacity-50 inline-flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        <span>사전조사 제출 완료하기</span>
      </button>
    </form>
  );
}
