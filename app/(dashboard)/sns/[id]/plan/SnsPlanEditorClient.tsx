"use client";

import { useState } from "react";
import { SnsAccount, SnsPlan, SnsIntakeResponse, PptTemplate } from "@/lib/db/types";
import { saveSnsPlanAction, generateSnsAiPlanAction } from "../../actions";
import { Sparkles, Download, Save, Loader2, FileText } from "lucide-react";

export default function SnsPlanEditorClient({
  account,
  initialPlan,
  intakeResponse,
  templates,
}: {
  account: SnsAccount;
  initialPlan: SnsPlan | null;
  intakeResponse: SnsIntakeResponse | null;
  templates: PptTemplate[];
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialPlan?.template_id || templates[0]?.id || null
  );
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const defaultValues: Record<string, string> = {
    브랜드명: account.company_name,
    채널명: `${account.platform.toUpperCase()} (@${account.handle})`,
    계약기간: `${account.starts_on || ""} ~ ${account.ends_on || ""}`,
    운영목표: "오가닉 팔로워 30% 증대 및 런칭 신제품 바이럴 확산",
    타겟오디언스: "스킨케어에 관심이 많은 20-34 여성 타깃",
    콘텐츠방향성: "릴스 중심의 고효율 제형 비포애프터 & 감성적인 피드 큐레이션",
    월별계획: "1개월차: 브랜드 인지도 제고\n2개월차: 실사용 후기 확산\n3개월차: 재구매 프로모션",
  };

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    initialPlan?.field_values || defaultValues
  );
  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleAiAssist = async () => {
    setLoadingAi(true);
    try {
      const res = await generateSnsAiPlanAction({
        accountId: account.id,
        templateId: selectedTemplateId,
      });
      setFieldValues(res.values);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSnsPlanAction({
        accountId: account.id,
        templateId: selectedTemplateId,
        fieldValues,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const placeholders = selectedTemplate?.placeholders || Object.keys(defaultValues);

  return (
    <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-6 shadow-xl font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-400" />
            <span>{account.company_name} SNS 공식 채널 운영 제안서 (운영안)</span>
          </h1>
          <p className="text-xs text-zinc-400">
            사전설문 응답을 기반으로 AI 초안을 생성하고, 완성된 제안서를 파워포인트(.pptx)로 다운로드합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loadingAi}
            onClick={handleAiAssist}
            className="px-3.5 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
          >
            {loadingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Gemini AI 초안 생성</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md transition active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>운영안 저장</span>
          </button>
          <a
            href={`/sns/${account.id}/plan/export`}
            className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>PPT 다운로드</span>
          </a>
        </div>
      </div>

      {savedNotice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
          SNS 운영안이 성공적으로 저장되었습니다. [PPT 다운로드]로 언제든 다운로드 가능합니다.
        </div>
      )}

      {/* Template Select */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">적용할 PPT 템플릿</label>
        <select
          value={selectedTemplateId || ""}
          onChange={(e) => setSelectedTemplateId(e.target.value || null)}
          className="w-full sm:w-80 px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500 font-semibold"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} (플레이스홀더 {t.placeholders.length}개)
            </option>
          ))}
        </select>
      </div>

      {/* Field Values Editor */}
      <div className="space-y-4 pt-3 border-t border-[#22242A]">
        <h3 className="text-xs font-bold text-zinc-300">운영안 슬라이드 치환 항목</h3>
        {placeholders.map((ph) => {
          const isLong = ["운영목표", "타겟오디언스", "콘텐츠방향성", "월별계획"].includes(ph);
          return (
            <div key={ph} className="space-y-1.5">
              <label className="text-xs font-bold text-sky-400 font-mono">
                {`{{${ph}}}`}
              </label>
              {isLong ? (
                <textarea
                  rows={3}
                  value={fieldValues[ph] || ""}
                  onChange={(e) => setFieldValues({ ...fieldValues, [ph]: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500 leading-relaxed"
                />
              ) : (
                <input
                  type="text"
                  value={fieldValues[ph] || ""}
                  onChange={(e) => setFieldValues({ ...fieldValues, [ph]: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}