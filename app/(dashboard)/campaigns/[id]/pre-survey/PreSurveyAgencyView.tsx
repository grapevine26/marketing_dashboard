"use client";

import { useState } from "react";
import { Campaign, PreSurveyTemplate, PreSurveyResponse } from "@/lib/db/types";
import { saveAgencyPreSurveyAction, getAiAssistAction } from "./actions";
import { Sparkles, Save, CheckCircle2, ArrowLeft, Loader2, Sliders } from "lucide-react";
import Link from "next/link";
import { safeCall } from "@/lib/actions/safeCall";

export default function PreSurveyAgencyView({
  campaign,
  template,
  initialResponse,
  isCustom,
  onSwitchToQuestionsTab,
}: {
  campaign: Campaign;
  template: PreSurveyTemplate;
  initialResponse: PreSurveyResponse | null;
  isCustom?: boolean;
  onSwitchToQuestionsTab?: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialResponse?.answers || {});
  const [loadingAiMap, setLoadingAiMap] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [usedAi, setUsedAi] = useState(initialResponse?.used_ai_assist ?? false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleAiAssist = async (questionId: string) => {
    setLoadingAiMap((prev) => ({ ...prev, [questionId]: true }));
    setNotice(null);
    setError(null);
    const res = await safeCall(getAiAssistAction({ campaignId: campaign.id, questionId, userDraft: answers[questionId] || "" }));
    setLoadingAiMap((prev) => ({ ...prev, [questionId]: false }));
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.data.fallback) {
      setNotice("AI 제안 실패 — 직접 입력해주세요.");
      return;
    }
    setUsedAi(true);
    setAnswers((prev) => ({ ...prev, [questionId]: res.data.recommendedDraft }));
    setSuggestions((prev) => ({ ...prev, [questionId]: res.data.suggestions }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await safeCall(saveAgencyPreSurveyAction({ campaignId: campaign.id, answers, usedAiAssist: usedAi }));
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans">
      {!onSwitchToQuestionsTab && (
        <div className="space-y-1">
          <Link href={`/campaigns/${campaign.id}`} className="text-xs text-text-sub hover:text-text inline-flex items-center gap-1 transition">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>캠페인 허브로 돌아가기</span>
          </Link>
          <h1 className="text-xl font-bold text-text">1. 사전조사 작성 및 AI 답변 추천</h1>
          <p className="text-xs text-text-sub">
            광고주가 직접 작성하거나, 에이전시가 광고주 대신 사전조사 내용을 작성/수정할 수 있습니다.
            {initialResponse && (
              <span className="ml-1 text-text-muted">
                (최근 제출: {new Date(initialResponse.submitted_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })})
              </span>
            )}
          </p>
        </div>
      )}

      {onSwitchToQuestionsTab && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface border border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-sub">적용 문항:</span>
            {isCustom ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold">
                이 캠페인 맞춤 문항 ({template.questions.length}개)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-surface2 text-text-sub border border-border text-[11px] font-semibold">
                공통 기본 템플릿 ({template.questions.length}개)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onSwitchToQuestionsTab}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold inline-flex items-center gap-1 self-start sm:self-auto"
          >
            <Sliders className="w-3 h-3" />
            <span>문항 추가·삭제·수정하기</span>
          </button>
        </div>
      )}

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn-soft text-xs font-semibold">{notice}</div>}

      <form onSubmit={handleSave} className="p-8 rounded-3xl bg-surface border border-border space-y-6 shadow-xl">
        <div className="space-y-5 divide-y divide-border">
          {template.questions.map((q, idx) => (
            <div key={q.id} className={idx > 0 ? "pt-5 space-y-2" : "space-y-2"}>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-text">
                  {idx + 1}. {q.question} {q.required && <span className="text-blue-400">*</span>}
                </label>
                <button
                  type="button"
                  disabled={loadingAiMap[q.id]}
                  onClick={() => handleAiAssist(q.id)}
                  className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-[11px] font-semibold transition inline-flex items-center gap-1 disabled:opacity-50"
                >
                  {loadingAiMap[q.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span>Gemini AI 추천</span>
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
                className="w-full px-4 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-border flex items-center justify-between">
          <div>
            {saved && (
              <span className="text-xs text-blue-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> 성공적으로 저장되었습니다!
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>사전조사 저장하기</span>
          </button>
        </div>
      </form>
    </div>
  );
}
