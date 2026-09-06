"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SnsAccount, SnsPlan } from "@/lib/db/types";
import { saveSnsPlanAction, generateSnsAiPlanAction } from "../../actions";
import DownloadFileButton from "@/components/DownloadFileButton";
import { Sparkles, Save, Loader2, FileText } from "lucide-react";

interface TemplateOption {
  id: string;
  name: string;
  placeholders: string[];
  builtin: boolean;
}

const DEFAULT_PLACEHOLDERS = ["브랜드명", "채널명", "계약기간", "운영목표", "타겟오디언스", "콘텐츠방향성", "월별계획"];
const LONG_FIELDS = new Set(["운영목표", "타겟오디언스", "콘텐츠방향성", "월별계획", "행사개요", "프로그램"]);

export default function SnsPlanEditorClient({
  account,
  initialPlan,
  hasIntake,
  templates,
}: {
  account: SnsAccount;
  initialPlan: SnsPlan | null;
  hasIntake: boolean;
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialPlan ? initialPlan.template_id : templates[0]?.id || null
  );
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null;
  const placeholders = selectedTemplate?.placeholders || DEFAULT_PLACEHOLDERS;

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    initialPlan?.field_values || {
      브랜드명: account.company_name,
      채널명: `${account.platform.toUpperCase()} (@${account.handle})`,
      계약기간: `${account.starts_on || "미정"} ~ ${account.ends_on || "미정"}`,
    }
  );
  const [loadingAiField, setLoadingAiField] = useState<string | null>(null);
  const [loadingAiAll, setLoadingAiAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(initialPlan));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setField = (ph: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [ph]: value }));
    setDirty(true);
  };

  const runAi = async (targets: string[]) => {
    setError(null);
    setNotice(null);
    const res = await generateSnsAiPlanAction({
      accountId: account.id,
      templateId: selectedTemplateId,
      placeholders: targets,
      currentValues: fieldValues,
    });
    if (!res.ok) return setError(res.error);
    if (res.data.fallback) {
      setNotice("AI 제안 실패 — 직접 입력해주세요.");
      return;
    }
    setFieldValues((prev) => ({ ...prev, ...res.data.values }));
    setDirty(true);
  };

  const handleAiField = async (ph: string) => {
    setLoadingAiField(ph);
    await runAi([ph]);
    setLoadingAiField(null);
  };

  const handleAiEmpty = async () => {
    const empty = placeholders.filter((ph) => !(fieldValues[ph] || "").trim());
    if (empty.length === 0) {
      setNotice("비어 있는 항목이 없습니다. 항목별 AI 버튼으로 다시 생성할 수 있습니다.");
      return;
    }
    setLoadingAiAll(true);
    await runAi(empty);
    setLoadingAiAll(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await saveSnsPlanAction({ accountId: account.id, templateId: selectedTemplateId, fieldValues });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setSaved(true);
    setDirty(false);
    setNotice(selectedTemplateId ? "운영안이 저장되었습니다. PPT를 다운로드할 수 있습니다." : "운영안이 저장되었습니다. (템플릿 미선택 — 웹에서만 사용)");
    router.refresh();
  };

  const canDownload = saved && !dirty && Boolean(selectedTemplateId);

  return (
    <div className="p-5 sm:p-7 rounded-3xl bg-surface border border-border space-y-6 shadow-xl font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-400" />
            <span>{account.company_name} SNS 공식 채널 운영 제안서</span>
          </h1>
          <p className="text-xs text-text-sub">
            사전설문 응답을 바탕으로 항목별 AI 초안을 만들고, 저장 후 파워포인트(.pptx)로 다운로드합니다.
            {!hasIntake && <span className="text-amber-400 ml-1">광고주 사전설문 응답이 아직 없어 AI 초안 품질이 낮을 수 있습니다.</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={loadingAiAll} onClick={handleAiEmpty} className="px-3.5 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50">
            {loadingAiAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>빈 항목만 AI로 채우기</span>
          </button>
          <button type="button" disabled={saving} onClick={handleSave} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md transition active:scale-95 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>운영안 저장{dirty ? " *" : ""}</span>
          </button>
          {canDownload ? (
            <DownloadFileButton href={`/sns/${account.id}/plan/export`} label="PPT 다운로드" fallbackFilename="SNS운영제안서.pptx" />
          ) : (
            <span className="text-[11px] text-text-muted">
              {!selectedTemplateId ? "템플릿을 선택해야 PPT를 만들 수 있습니다." : dirty ? "변경 사항을 저장하면 다운로드할 수 있습니다." : "저장 후 다운로드할 수 있습니다."}
            </span>
          )}
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">{notice}</div>}

      <div className="space-y-1">
        <label className="text-xs font-semibold text-text-2">적용할 PPT 템플릿 (선택 안 함 = 웹 화면만 사용)</label>
        <select
          value={selectedTemplateId || ""}
          onChange={(e) => { setSelectedTemplateId(e.target.value || null); setDirty(true); }}
          className="w-full sm:w-96 px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-sky-500 font-semibold"
        >
          <option value="">템플릿 선택 안 함</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.builtin ? "[기본] " : ""}{t.name} (치환 항목 {t.placeholders.length}개)</option>
          ))}
        </select>
      </div>

      <div className="space-y-4 pt-3 border-t border-border">
        <h3 className="text-xs font-bold text-text-2">운영안 항목</h3>
        {placeholders.map((ph) => (
          <div key={ph} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-sky-400 font-mono">{`{{${ph}}}`}</label>
              <button type="button" disabled={loadingAiField === ph} onClick={() => handleAiField(ph)} className="px-2 py-0.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 text-[10px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                {loadingAiField === ph ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI 초안
              </button>
            </div>
            <textarea
              rows={LONG_FIELDS.has(ph) ? 4 : 2}
              value={fieldValues[ph] || ""}
              onChange={(e) => setField(ph, e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-sky-500 leading-relaxed"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
