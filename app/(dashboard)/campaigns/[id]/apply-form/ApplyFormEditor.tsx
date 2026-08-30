"use client";

import { useState } from "react";
import { Campaign, CampaignFormConfig, CustomQuestion } from "@/lib/db/types";
import { saveFormConfigAction, generateAiIntroAction } from "./actions";
import { Sparkles, Plus, Trash2, Save, Check, Globe, Eye, Loader2 } from "lucide-react";

export default function ApplyFormEditor({
  campaign,
  initialConfig,
  preSurveyAnswers,
}: {
  campaign: Campaign;
  initialConfig: CampaignFormConfig | null;
  preSurveyAnswers: Record<string, string>;
}) {
  const [introText, setIntroText] = useState(
    initialConfig?.intro_text ||
      `안녕하세요! ${campaign.company_name}의 ${campaign.name} 시딩 체험단에 참여할 인플루언서를 모집합니다 ✨`
  );
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>(
    initialConfig?.custom_questions || []
  );
  const [isPublished, setIsPublished] = useState(initialConfig?.is_published ?? true);
  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleGenerateAiIntro = async () => {
    setLoadingAi(true);
    try {
      const generated = await generateAiIntroAction({
        campaignName: campaign.name,
        companyName: campaign.company_name,
        campaignType: campaign.campaign_type,
        preSurveyAnswers,
      });
      setIntroText(generated);
    } finally {
      setLoadingAi(false);
    }
  };

  const addCustomQuestion = () => {
    const newQ: CustomQuestion = {
      id: "cq_" + Date.now(),
      label: "",
      type: "text",
      required: false,
    };
    setCustomQuestions([...customQuestions, newQ]);
  };

  const removeCustomQuestion = (id: string) => {
    setCustomQuestions(customQuestions.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, patch: Partial<CustomQuestion>) => {
    setCustomQuestions(
      customQuestions.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    await saveFormConfigAction({
      campaignId: campaign.id,
      introText,
      customQuestions,
      isPublished,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Intro Text Section */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">모집 신청폼 상단 소개글</h2>
            <p className="text-xs text-slate-400">
              인플루언서가 신청 페이지에 접속했을 때 가장 먼저 보게 되는 안내 문구입니다.
            </p>
          </div>
          <button
            type="button"
            disabled={loadingAi}
            onClick={handleGenerateAiIntro}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition disabled:opacity-50"
          >
            {loadingAi ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>AI 모집글 자동 생성</span>
          </button>
        </div>

        <textarea
          rows={5}
          value={introText}
          onChange={(e) => setIntroText(e.target.value)}
          placeholder="인플루언서 모집 안내 문구를 작성하세요."
          className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Default Standard Fields Info */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <h2 className="text-sm font-bold text-slate-200">기본 수집 표준 항목 (자동 포함)</h2>
        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">이름</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">SNS 계정 링크</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">국적</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">연락처</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
            {campaign.campaign_type === "shipping" ? "배송지 주소" : "희망 방문일시 및 인원"}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">개인정보/2차활용 동의</span>
        </div>
      </div>

      {/* Custom Questions Section */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">커스텀 질문 추가 ({customQuestions.length}개)</h2>
            <p className="text-xs text-slate-400">피부타입, 업로드 주기 등 캠페인에 특화된 질문을 추가합니다.</p>
          </div>
          <button
            type="button"
            onClick={addCustomQuestion}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>질문 추가</span>
          </button>
        </div>

        {customQuestions.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">추가된 커스텀 질문이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {customQuestions.map((q, idx) => (
              <div
                key={q.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3"
              >
                <span className="text-xs font-bold text-indigo-400 w-8">#{idx + 1}</span>
                <input
                  type="text"
                  value={q.label}
                  onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                  placeholder="질문 라벨 (예: 현재 피부 타입 및 고민)"
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                  />
                  <span>필수</span>
                </label>
                <button
                  type="button"
                  onClick={() => removeCustomQuestion(q.id)}
                  className="p-1.5 rounded text-slate-500 hover:text-red-400 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Publish Toggle & Save */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          <div>
            <span className="font-semibold text-white text-sm">신청폼 공개 게시 활성화</span>
            <p className="text-xs text-slate-400">체크 해제 시 외부 인플루언서의 지원 접수가 일시 중단됩니다.</p>
          </div>
        </label>

        <div className="flex items-center gap-3">
          <a
            href={`/apply/${campaign.apply_form_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition"
          >
            <Eye className="w-4 h-4" />
            <span>신청폼 미리보기</span>
          </a>

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
                <span>{saving ? "저장 중..." : "신청폼 설정 저장"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}