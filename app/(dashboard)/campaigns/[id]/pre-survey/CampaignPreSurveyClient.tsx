"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Sliders, CheckCircle2, Clock } from "lucide-react";
import { Campaign, PreSurveyTemplate, PreSurveyResponse, PreSurveyQuestion } from "@/lib/db/types";
import PreSurveyAgencyView from "./PreSurveyAgencyView";
import CampaignPreSurveyQuestionEditor from "./CampaignPreSurveyQuestionEditor";

interface CampaignPreSurveyClientProps {
  campaign: Campaign;
  resolvedQuestions: PreSurveyQuestion[];
  isCustom: boolean;
  defaultTemplateQuestions: PreSurveyQuestion[];
  initialResponse: PreSurveyResponse | null;
}

export default function CampaignPreSurveyClient({
  campaign,
  resolvedQuestions,
  isCustom,
  defaultTemplateQuestions,
  initialResponse,
}: CampaignPreSurveyClientProps) {
  const [activeTab, setActiveTab] = useState<"answers" | "questions">("answers");

  const template: PreSurveyTemplate = {
    id: 1,
    questions: resolvedQuestions,
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans">
      {/* Header */}
      <div className="space-y-2">
        <Link
          href={`/campaigns/${campaign.id}`}
          className="text-xs text-text-sub hover:text-text inline-flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>캠페인 허브로 돌아가기</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">1. 사전조사 관리 (Pre-Survey)</h1>
            <p className="text-xs sm:text-sm text-text-sub mt-0.5">
              광고주가 제출한 답변을 조회·수정하거나, 이 캠페인 전용 설문 문항을 추가/삭제할 수 있습니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {initialResponse ? (
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>답변 제출완료</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-surface2 text-text-sub border border-border text-xs font-semibold inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>답변 대기중</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("answers")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 ${
            activeTab === "answers"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-surface text-text-sub hover:text-text border border-border"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>사전조사 답변 작성 및 AI 추천</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("questions")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 ${
            activeTab === "questions"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-surface text-text-sub hover:text-text border border-border"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>설문 문항 커스텀 설정</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeTab === "questions" ? "bg-white/20 text-white" : "bg-surface2 text-text-muted"
            }`}
          >
            {resolvedQuestions.length}
          </span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "answers" && (
        <PreSurveyAgencyView
          campaign={campaign}
          template={template}
          initialResponse={initialResponse}
          isCustom={isCustom}
          onSwitchToQuestionsTab={() => setActiveTab("questions")}
        />
      )}

      {activeTab === "questions" && (
        <CampaignPreSurveyQuestionEditor
          campaignId={campaign.id}
          initialQuestions={resolvedQuestions}
          isCustom={isCustom}
          defaultTemplateQuestions={defaultTemplateQuestions}
        />
      )}
    </div>
  );
}
