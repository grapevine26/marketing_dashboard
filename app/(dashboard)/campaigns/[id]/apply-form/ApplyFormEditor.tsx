"use client";

import { useState } from "react";
import { Campaign, CampaignFormConfig, CustomQuestion } from "@/lib/db/types";
import { saveFormConfigAction, generateAiIntroAction } from "./actions";
import { Sparkles, Save, Plus, Trash2, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function ApplyFormEditor({
  campaign,
  initialConfig,
  preSurveyAnswers,
}: {
  campaign: Campaign;
  initialConfig: CampaignFormConfig | null;
  preSurveyAnswers?: Record<string, string>;
}) {
  const [introText, setIntroText] = useState(
    initialConfig?.intro_text ||
      `안녕하세요! ${campaign.company_name}의 신규 캠페인 '${campaign.name}' 인플루언서 체험단을 모집합니다.`
  );
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>(
    initialConfig?.custom_questions || []
  );
  const [isPublished, setIsPublished] = useState(
    initialConfig?.is_published ?? true
  );

  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleAiIntro = async () => {
    setLoadingAi(true);
    try {
      const res = await generateAiIntroAction({
        companyName: campaign.company_name,
        campaignName: campaign.name,
        campaignType: campaign.campaign_type,
        preSurveyAnswers,
      });
      if (res) {
        setIntroText(res);
      }
    } finally {
      setLoadingAi(false);
    }
  };

  const handleAddQuestion = () => {
    const newQ: CustomQuestion = {
      id: `cq_${Date.now()}`,
      label: "",
      type: "text",
      required: false,
    };
    setCustomQuestions([...customQuestions, newQ]);
  };

  const handleRemoveQuestion = (id: string) => {
    setCustomQuestions(customQuestions.filter((q) => q.id !== id));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveFormConfigAction({
        campaignId: campaign.id,
        introText,
        customQuestions,
        isPublished,
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
        <h1 className="text-xl font-bold text-zinc-100">2. 인플루언서 신청폼 설정 에디터</h1>
        <p className="text-xs text-zinc-400">
          모집글 소개 문구(Gemini AI 작성 지원)와 인플루언서에게 추가로 물어볼 질문들을 커스텀 설정합니다.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-100">모집 소개글 (Intro Text)</h2>
            <button
              type="button"
              disabled={loadingAi}
              onClick={handleAiIntro}
              className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold hover:bg-blue-500/20 transition inline-flex items-center gap-1.5"
            >
              {loadingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Gemini AI 모집글 초안 생성</span>
            </button>
          </div>

          <textarea
            rows={5}
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
          />
        </div>

        <div className="p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-100">추가 커스텀 문항</h2>
              <p className="text-xs text-zinc-400">기본 정보(성함, SNS, 연락처, 주소/방문일정) 외에 추가로 확인할 항목</p>
            </div>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="px-3 py-1.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>질문 추가</span>
            </button>
          </div>

          {customQuestions.length === 0 ? (
            <div className="p-6 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-xl bg-[#090A0C]">
              추가 문항이 없습니다. 필요한 경우 질문 추가 버튼을 누르세요.
            </div>
          ) : (
            <div className="space-y-3">
              {customQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-4 rounded-xl bg-[#090A0C] border border-[#22242A] flex items-center gap-3"
                >
                  <span className="text-xs font-mono text-zinc-500">{idx + 1}</span>
                  <input
                    type="text"
                    required
                    value={q.label}
                    onChange={(e) => {
                      const updated = [...customQuestions];
                      updated[idx].label = e.target.value;
                      setCustomQuestions(updated);
                    }}
                    placeholder="질문 내용을 입력하세요 (예: 피부 타입 및 고민)"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                  <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => {
                        const updated = [...customQuestions];
                        updated[idx].required = e.target.checked;
                        setCustomQuestions(updated);
                      }}
                      className="accent-blue-600"
                    />
                    <span>필수</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(q.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] flex items-center justify-between shadow-xl">
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="accent-blue-600"
            />
            <span>신청폼 활성화 (체크 해제 시 지원 접수 일시 중단)</span>
          </label>

          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-xs text-blue-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> 저장 완료!
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>신청폼 설정 저장</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}