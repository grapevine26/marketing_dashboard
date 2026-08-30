"use client";

import { useState } from "react";
import { Campaign, PreSurveyTemplate, PreSurveyResponse } from "@/lib/db/types";
import { saveAgencyPreSurveyAction, getAiAssistAction } from "./actions";
import { Sparkles, Save, CheckCircle2, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

export default function PreSurveyAgencyView({
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleAiAssist = async (questionId: string, questionText: string) => {
    setLoadingAiMap((prev) => ({ ...prev, [questionId]: true }));
    try {
      const res = await getAiAssistAction({
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveAgencyPreSurveyAction({
        campaignId: campaign.id,
        answers,
        usedAiAssist: true,
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
          href={`/campaigns/${campaign.id}`}
          className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>캠페인 허브로 돌아가기</span>
        </Link>
        <h1 className="text-xl font-bold text-zinc-100">1. 사전조사 작성 및 AI 답변 추천</h1>
        <p className="text-xs text-zinc-400">
          광고주가 직접 작성하거나, 에이전시가 광고주 대신 사전조사 내용을 작성/수정할 수 있습니다.
        </p>
      </div>

      <form onSubmit={handleSave} className="p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-6 shadow-xl">
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
                  <span>Gemini AI 추천</span>
                </button>
              </div>

              <textarea
                rows={3}
                required={q.required}
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                placeholder={q.placeholder || "내용을 입력하세요..."}
                className="w-full px-4 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-[#22242A] flex items-center justify-between">
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