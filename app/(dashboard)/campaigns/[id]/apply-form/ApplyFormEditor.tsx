"use client";

import { useState } from "react";
import { Campaign, CampaignFormConfig, CustomQuestion, CustomQuestionType } from "@/lib/db/types";
import { saveFormConfigAction, generateAiIntroAction } from "./actions";
import { Sparkles, Save, Plus, Trash2, ArrowLeft, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { safeCall } from "@/lib/actions/safeCall";

const TYPE_LABELS: Record<CustomQuestionType, string> = {
  text: "단답/서술",
  number: "숫자",
  select: "선택형",
  checkbox: "체크박스(동의)",
};

export default function ApplyFormEditor({
  campaign,
  initialConfig,
  applyPath,
}: {
  campaign: Campaign;
  initialConfig: CampaignFormConfig | null;
  applyPath: string;
}) {
  const [introText, setIntroText] = useState(
    initialConfig?.intro_text ||
      `안녕하세요! ${campaign.company_name}의 신규 캠페인 '${campaign.name}' 인플루언서 체험단을 모집합니다.`
  );
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>(initialConfig?.custom_questions || []);
  const [isPublished, setIsPublished] = useState(initialConfig?.is_published ?? true);

  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAiIntro = async () => {
    setLoadingAi(true);
    setNotice(null);
    setError(null);
    const res = await safeCall(generateAiIntroAction(campaign.id));
    setLoadingAi(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.data.fallback) {
      setNotice("AI 제안 실패 — 기본 문구를 넣었습니다. 직접 수정해주세요.");
    }
    setIntroText(res.data.text);
  };

  const updateQuestion = (id: string, patch: Partial<CustomQuestion>) => {
    setCustomQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const handleAddQuestion = () => {
    setCustomQuestions((prev) => [
      ...prev,
      { id: `cq_${Date.now()}`, label: "", type: "text", required: false },
    ]);
  };

  const handleRemoveQuestion = (id: string) => {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await safeCall(saveFormConfigAction({
      campaignId: campaign.id,
      introText,
      customQuestions,
      isPublished,
    }));
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCustomQuestions(res.data.custom_questions);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans">
      <div className="space-y-1">
        <Link href={`/campaigns/${campaign.id}`} className="text-xs text-text-sub hover:text-text inline-flex items-center gap-1 transition">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>캠페인 허브로 돌아가기</span>
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-text">2. 인플루언서 신청폼 설정 에디터</h1>
          <a href={applyPath} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1">
            <ExternalLink className="w-3.5 h-3.5" /> 공개 신청폼 미리보기
          </a>
        </div>
        <p className="text-xs text-text-sub">
          모집글 소개 문구(Gemini AI 작성 지원)와 인플루언서에게 추가로 물어볼 질문들을 커스텀 설정합니다.
        </p>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn-soft text-xs font-semibold">{notice}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="p-8 rounded-3xl bg-surface border border-border space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text">모집 소개글 (Intro Text)</h2>
            <button
              type="button"
              disabled={loadingAi}
              onClick={handleAiIntro}
              className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold hover:bg-blue-500/20 transition inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {loadingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Gemini AI 모집글 초안 생성</span>
            </button>
          </div>

          <textarea
            rows={6}
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
          />
        </div>

        <div className="p-8 rounded-3xl bg-surface border border-border space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-text">추가 커스텀 문항</h2>
              <p className="text-xs text-text-sub">
                기본 정보(성함, SNS, 연락처, 국적, {campaign.campaign_type === "shipping" ? "배송지" : "방문일정/인원"}) 외에 추가로 확인할 항목
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text text-xs font-semibold inline-flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>질문 추가</span>
            </button>
          </div>

          {customQuestions.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-xs border border-dashed border-border rounded-xl bg-bg">
              추가 문항이 없습니다. 필요한 경우 질문 추가 버튼을 누르세요.
            </div>
          ) : (
            <div className="space-y-3">
              {customQuestions.map((q, idx) => (
                <div key={q.id} className="p-4 rounded-xl bg-bg border border-border space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-text-muted">{idx + 1}</span>
                    <input
                      type="text"
                      required
                      value={q.label}
                      onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                      placeholder="질문 내용을 입력하세요 (예: 피부 타입 및 고민)"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-none focus:border-blue-500"
                    />
                    <select
                      value={q.type}
                      onChange={(e) => {
                        const type = e.target.value as CustomQuestionType;
                        updateQuestion(q.id, { type, options: type === "select" ? q.options || [] : undefined });
                      }}
                      className="px-2 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-none focus:border-blue-500"
                    >
                      {(Object.keys(TYPE_LABELS) as CustomQuestionType[]).map((t) => (
                        <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-text-sub cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                        className="accent-blue-600"
                      />
                      <span>필수</span>
                    </label>
                    <button type="button" onClick={() => handleRemoveQuestion(q.id)} className="p-1.5 text-text-muted hover:text-red-400 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {q.type === "select" && (
                    <input
                      type="text"
                      value={(q.options || []).join(", ")}
                      onChange={(e) =>
                        updateQuestion(q.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                      }
                      placeholder="선택지를 쉼표로 구분해 입력 (예: 건성, 지성, 복합성, 민감성)"
                      className="w-full ml-6 px-3 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-none focus:border-blue-500"
                      style={{ width: "calc(100% - 1.5rem)" }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 rounded-3xl bg-surface border border-border flex items-center justify-between shadow-xl">
          <label className="flex items-center gap-2 text-xs font-semibold text-text-2 cursor-pointer">
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
