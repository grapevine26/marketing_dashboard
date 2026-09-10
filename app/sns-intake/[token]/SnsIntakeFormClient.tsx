"use client";

import { useState } from "react";
import { PublicSnsAccount, SnsIntakeTemplate } from "@/lib/db/types";
import { submitSnsIntakeAction, assistSnsIntakeAction } from "../actions";
import { CheckCircle2, Loader2, Send, Sparkles, Info, Edit3 } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";

const MAX_AI_ATTEMPTS = 3;

export default function SnsIntakeFormClient({
  token,
  account,
  template,
  initialAnswers,
  initialAiUsage,
}: {
  token: string;
  account: PublicSnsAccount;
  template: SnsIntakeTemplate;
  initialAnswers: Record<string, string> | null;
  initialAiUsage?: Record<string, number>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers || {});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [aiLoadingKey, setAiLoadingKey] = useState<string | null>(null);
  const [aiUsageMap, setAiUsageMap] = useState<Record<string, number>>(initialAiUsage || {});
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
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

    setAiLoadingKey(questionId);
    setError(null);
    setNotice(null);

    const res = await safeCall(
      assistSnsIntakeAction({
        token,
        questionId,
        userDraft: isRegen ? undefined : currentText,
        previousDraft: isRegen ? currentText : undefined,
        forceRefresh: isRegen,
        isRegeneration: isRegen,
      })
    );
    setAiLoadingKey(null);
    if (!res.ok) return setError(res.error);
    if (res.data.fallback) {
      setNotice("AI 제안 실패 — 직접 입력해주세요.");
      return;
    }

    const newUsage =
      typeof res.data.remainingAttempts === "number"
        ? MAX_AI_ATTEMPTS - res.data.remainingAttempts
        : currentUsage + 1;

    setAiUsageMap((prev) => ({ ...prev, [questionId]: newUsage }));
    setAnswers((prev) => ({ ...prev, [questionId]: res.data.recommendedDraft }));
    setSuggestions((prev) => ({ ...prev, [questionId]: res.data.suggestions }));

    if (newUsage >= MAX_AI_ATTEMPTS) {
      setNotice("이 질문의 AI 추천 횟수(최대 3회)를 모두 사용했습니다. 필요 시 직접 문구를 수정해 주세요.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await safeCall(submitSnsIntakeAction({ token, answers, honeypot }));
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center space-y-3 bg-bg rounded-2xl border border-emerald-500/30 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-text">사전설문 제출이 완료되었습니다!</h2>
          <p className="text-xs sm:text-sm text-text-sub max-w-md mx-auto leading-relaxed">
            보내주신 답변을 바탕으로 {account.company_name}에 최적화된 SNS 콘텐츠를 기획하겠습니다.
          </p>
        </div>

        <div className="p-5 sm:p-6 rounded-2xl bg-bg border border-border space-y-4">
          <h3 className="text-xs font-bold text-text-sub uppercase tracking-wider">제출된 답변 요약</h3>
          <div className="space-y-3 divide-y divide-border">
            {template.questions.map((q, idx) => (
              <div key={q.id} className={idx > 0 ? "pt-3 space-y-1" : "space-y-1"}>
                <div className="text-xs font-semibold text-accent2">{idx + 1}. {q.question}</div>
                <div className="text-xs text-text-2 whitespace-pre-line leading-relaxed pl-2 border-l-2 border-border">{answers[q.id] || "(답변 없음)"}</div>
              </div>
            ))}
          </div>
        </div>

        <button type="button" onClick={() => setSubmitted(false)} className="w-full py-3 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-semibold border border-border inline-flex items-center justify-center gap-1.5 transition">
          <Edit3 className="w-3.5 h-3.5" />
          <span>답변 내용 다시 수정하기</span>
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {initialAnswers && (
        <div className="p-3.5 rounded-xl bg-accent2/10 border border-accent2/20 text-accent2 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0 text-accent2" />
          <span>이전에 제출하신 답변이 등록되어 있습니다. 필요한 항목을 수정하여 다시 제출하실 수 있습니다.</span>
        </div>
      )}
      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn-soft text-xs font-semibold">{notice}</div>}

      <div className="space-y-6">
        {template.questions.map((q, idx) => {
          const usage = aiUsageMap[q.id] || 0;
          const isMax = usage >= MAX_AI_ATTEMPTS;
          const remaining = Math.max(0, MAX_AI_ATTEMPTS - usage);

          return (
            <div key={q.id} className="p-4 sm:p-5 rounded-2xl bg-bg border border-border space-y-3 focus-within:border-accent2/50 transition">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs sm:text-sm font-bold text-text flex items-start gap-1.5">
                  <span className="text-accent2 font-mono">{idx + 1}.</span>
                  <span>{q.question} {q.required && <strong className="text-rose-400">*</strong>}</span>
                </label>
                <button
                  type="button"
                  disabled={aiLoadingKey === q.id || isMax}
                  onClick={() => handleAiAssist(q.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition active:scale-95 shrink-0 self-start sm:self-auto disabled:opacity-50 disabled:cursor-not-allowed ${
                    isMax
                      ? "bg-surface2 text-text-muted border border-border"
                      : "bg-accent2/10 hover:bg-accent2/20 text-accent2 border border-accent2/20"
                  }`}
                  title={isMax ? "최대 추천 횟수(3회)를 모두 사용했습니다." : undefined}
                >
                  {aiLoadingKey === q.id ? (
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
                        ? `다른 답변 추천 (${remaining}회 남음)`
                        : answers[q.id]?.trim()
                          ? "AI 초안 다듬기 (3회 가능)"
                          : "AI 추천 답변 (3회 가능)"}
                  </span>
                </button>
              </div>

            {suggestions[q.id]?.length ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {suggestions[q.id].map((s) => (
                  <span key={s} className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] font-medium">💡 {s}</span>
                ))}
              </div>
            ) : null}

            <textarea
              required={q.required}
              rows={3}
              value={answers[q.id] || ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              placeholder={q.placeholder || "상세한 내용을 입력해주세요."}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-text text-xs sm:text-sm focus:outline-none focus:border-accent2 leading-relaxed placeholder:text-text-faint resize-y"
            />
            </div>
          );
        })}
      </div>

      {/* 허니팟 숨김 필드 (봇 스팸 방어) */}
      <div style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
        <label htmlFor="snsintake_hp_website">웹사이트 (비워두세요)</label>
        <input
          id="snsintake_hp_website"
          type="text"
          name="snsintake_hp_website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-2xl bg-accent2 hover:bg-accent2/90 text-white text-xs sm:text-sm font-bold shadow-xl transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        <span>{initialAnswers ? "설문 답변 수정하여 다시 제출" : "사전설문 제출하기"}</span>
      </button>
    </form>
  );
}
