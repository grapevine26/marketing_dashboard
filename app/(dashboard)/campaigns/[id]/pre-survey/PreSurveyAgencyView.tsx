"use client";

import { useState } from "react";
import { Campaign, PreSurveyTemplate, PreSurveyResponse } from "@/lib/db/types";
import { saveAgencyPreSurveyAction, getAiAssistAction } from "./actions";
import { Sparkles, Save, Check, Loader2 } from "lucide-react";

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
  const [loadingAi, setLoadingAi] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAiAssist = async (questionId: string, questionText: string) => {
    setLoadingAi(questionId);
    try {
      const res = await getAiAssistAction({
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

  const handleSave = async () => {
    setSaving(true);
    await saveAgencyPreSurveyAction({
      campaignId: campaign.id,
      answers,
      usedAiAssist: Object.keys(aiSuggestions).length > 0,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {initialResponse && (
        <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-900/50 text-xs text-blue-300 flex items-center justify-between">
          <span>
            작성자: <strong>{initialResponse.filled_by === "company" ? "광고주 직접 제출" : "에이전시 대리 작성"}</strong>
          </span>
          <span>제출일: {new Date(initialResponse.submitted_at).toLocaleString("ko-KR")}</span>
        </div>
      )}

      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
        {template.questions.map((q, idx) => (
          <div key={q.id} className="space-y-3 pb-6 border-b border-slate-800 last:border-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-semibold text-slate-200">
                <span className="text-blue-400 mr-2">Q{idx + 1}.</span>
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
                <span>AI 답변 추천</span>
              </button>
            </div>

            <textarea
              rows={3}
              value={answers[q.id] || ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              placeholder={q.placeholder || "답변을 입력하세요"}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
            />

            {aiSuggestions[q.id] && (
              <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-900/30 space-y-1.5">
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
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md transition disabled:opacity-50"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>저장 완료!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{saving ? "저장 중..." : "답변 저장하기"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}