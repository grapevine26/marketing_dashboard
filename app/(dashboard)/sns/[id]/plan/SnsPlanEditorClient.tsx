"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SnsAccount, SnsPlan } from "@/lib/db/types";
import { saveSnsPlanAction, generateSnsAiPlanAction } from "../../actions";
import DownloadFileButton from "@/components/DownloadFileButton";
import { Sparkles, Save, Loader2, FileText } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";

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
  /**
   * 저장돼 있던 PPT 템플릿이 그 사이 삭제된 상태.
   *
   * 행사 운영안(EventDetailClient)의 `templateMissing` 과 같은 처리를 옮겨 왔다. 다만 조건이 다르다 —
   * 여기서는 "템플릿 선택 안 함"(null)이 정상적인 선택지라서, 템플릿 개수가 아니라
   * **id 가 걸려 있는데 그 템플릿이 없는 경우**만 삭제로 본다.
   */
  const templateMissing = Boolean(selectedTemplateId) && !selectedTemplate;

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    initialPlan?.field_values || {
      브랜드명: account.company_name,
      채널명: `${account.platform.toUpperCase()} (@${account.handle})`,
      계약기간: `${account.starts_on || "미정"} ~ ${account.ends_on || "미정"}`,
    }
  );

  // 템플릿이 삭제됐을 때 기본 항목으로 갈아치우지 않는다. 그러면 업로드 템플릿의 커스텀 항목에
  // 적어 둔 내용이 화면에서 통째로 사라져, 사용자는 값이 날아간 줄 안다(값은 그대로 들고 있다).
  // 지금 들고 있는 값의 키를 그대로 보여 주어 눈에서 사라지지 않게 한다.
  const savedPlaceholders = Object.keys(fieldValues);
  const placeholders =
    selectedTemplate?.placeholders ||
    (templateMissing && savedPlaceholders.length > 0 ? savedPlaceholders : DEFAULT_PLACEHOLDERS);
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
    const res = await safeCall(generateSnsAiPlanAction({
      accountId: account.id,
      templateId: selectedTemplateId,
      placeholders: targets,
      currentValues: fieldValues,
    }));
    if (!res.ok) {
      setError(res.error);
      // 항목이 많은 긴 폼이라 화면 위쪽 배너가 스크롤 밖에 있을 수 있다. 배너는 그대로 두고,
      // 어느 위치에서 눌러도 보이는 토스트를 같이 띄운다. 안 그러면 "눌렀는데 아무 일도 안 일어난다"로 보인다.
      toast.error(res.error || "AI 초안 생성에 실패했습니다.");
      return;
    }
    if (res.data.fallback) {
      setNotice("AI 제안 실패 — 직접 입력해주세요.");
      // 폴백은 결과적으로 실패와 같다(채워진 항목이 없다). 배너만 바뀌면 실패한 줄 모른다.
      toast.warning("AI 초안을 만들지 못했습니다.", { description: "직접 입력해주세요." });
      return;
    }
    setFieldValues((prev) => ({ ...prev, ...res.data.values }));
    setDirty(true);
    // 성공해도 화면 아래쪽 입력칸이 조용히 바뀌는 게 전부라, 무엇이 채워졌는지 알 수 없었다.
    // 채운 항목 이름을 그대로 보여준다.
    const filled = Object.keys(res.data.values);
    if (filled.length > 0) {
      toast.success(`AI 초안으로 ${filled.length}개 항목을 채웠습니다.`, {
        description: filled.join(", "),
      });
    }
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
      // 아무것도 안 하고 끝나는 경로다. 배너가 스크롤 밖이면 버튼이 고장 난 것처럼 보인다.
      toast.info("비어 있는 항목이 없습니다.", {
        description: "항목별 AI 버튼으로 다시 생성할 수 있습니다.",
      });
      return;
    }
    setLoadingAiAll(true);
    await runAi(empty);
    setLoadingAiAll(false);
  };

  // 불러온 운영안의 저장 시각. 저장할 때 같이 보내 다른 사람의 저장을 덮어쓰지 않게 한다.
  // 성공하면 서버가 준 새 시각으로 바꾼다.
  const [planUpdatedAt, setPlanUpdatedAt] = useState<string | null>(initialPlan?.updated_at ?? null);
  /**
   * 저장하려는데 그 사이 남이 먼저 저장한 상태. 토스트만 띄우면 막다른 길이 된다 —
   * 실패 경로에서는 기준 시각이 안 바뀌므로 **다시 눌러도 영원히 같은 오류**고,
   * 안내대로 새로고침하면 그때까지 쓴 운영안이 통째로 사라진다.
   * 내가 쓴 내용은 멀쩡하니 무엇을 할지 고르게만 해 주면 된다(SNS 콘텐츠 모달과 같은 방식).
   */
  const [saveConflict, setSaveConflict] = useState(false);
  /**
   * "내 내용으로 덮어쓰기" 를 고른 상태. 저장할 때 화면이 들고 있는 옛 기준 대신
   * 서버 컴포넌트가 방금 내려준 최신 기준 시각으로 보낸다.
   *
   * SNS 콘텐츠처럼 기준 시각을 null 로 버리는 방법은 여기서 못 쓴다. 단일 행 문서의 잠금
   * (writeWithOptimisticLock)은 **행이 이미 있는데 기준 시각이 없으면 저장 자체를 거부**한다.
   */
  const [overwriteArmed, setOverwriteArmed] = useState(false);
  /** "최신 내용 불러오기" 를 고른 상태. 새 props 가 도착하면 그 값으로 화면을 갈아끼운다. */
  const [discardArmed, setDiscardArmed] = useState(false);

  // 서버가 새 값을 내려주면(=router.refresh() 가 도착하면) 화면을 다시 맞춘다.
  // effect 가 아니라 렌더 중에 맞춘다(SNS 계정 상세와 같은 방식). effect 로 하면 옛 값으로
  // 한 번 그린 뒤 다시 그려 깜빡인다.
  //
  // **평소에는 아무것도 하지 않는다.** 사용자가 "최신 내용 불러오기" 를 고른 순간에만 받아들인다.
  // 아무 refresh 에나 기준 시각을 최신으로 올려 버리면, 남의 저장을 본 적도 없이 덮어쓰게 되어
  // 잠금이 있으나 마나 해진다.
  const [syncedFrom, setSyncedFrom] = useState(initialPlan);
  if (syncedFrom !== initialPlan) {
    setSyncedFrom(initialPlan);
    if (discardArmed && initialPlan) {
      setFieldValues(initialPlan.field_values || {});
      setSelectedTemplateId(initialPlan.template_id);
      setPlanUpdatedAt(initialPlan.updated_at);
      setSaved(true);
      setDirty(false);
      setDiscardArmed(false);
      setSaveConflict(false);
      setOverwriteArmed(false);
      setError(null);
      setNotice("최신 내용을 불러왔습니다. 내가 고치던 내용은 버렸습니다.");
    }
  }

  const handleSave = async () => {
    if (templateMissing) {
      // 삭제된 템플릿 id 를 그대로 보내면 서버가 "SNS용 PPT 템플릿을 찾을 수 없습니다" 라고 답한다.
      // 고른 적도 없는 템플릿 얘기라 사용자는 무슨 말인지 알 수 없다. 화면에서 실제 상황을 말해 준다.
      const msg = "이 운영안에 저장돼 있던 PPT 템플릿이 삭제되었습니다. 위에서 쓸 템플릿을 다시 고르거나 '템플릿 선택 안 함' 을 고른 뒤 저장해주세요.";
      setError(msg);
      toast.error("삭제된 PPT 템플릿이 걸려 있습니다.", { description: "위에서 템플릿을 다시 골라주세요." });
      return;
    }
    setSaving(true);
    setError(null);
    // 덮어쓰기를 골랐으면 서버 컴포넌트가 방금 받아 온 최신 기준 시각으로 저장한다.
    // 아직 안 왔으면 옛 기준 그대로라 또 충돌이 나는데, 그건 막다른 길이 아니라
    // "조금 뒤 한 번 더" 로 풀리는 상태다(아래 실패 경로에서 refresh 를 다시 건다).
    const baseline = overwriteArmed ? (initialPlan?.updated_at ?? planUpdatedAt) : planUpdatedAt;
    const res = await safeCall(
      saveSnsPlanAction({
        accountId: account.id,
        templateId: selectedTemplateId,
        fieldValues,
        expectedUpdatedAt: baseline,
      })
    );
    setSaving(false);
    if (!res.ok) {
      // 충돌은 실패와 다르다. 내가 쓴 내용은 멀쩡하고, 무엇을 할지 고르기만 하면 된다.
      if ((res.error || "").includes("먼저 저장했습니다")) {
        setSaveConflict(true);
        setError(null);
        setNotice(null);
        // 덮어쓰기를 골랐는데도 충돌이면 최신 기준이 아직 안 온 것이다. 한 번 더 요청해 둔다.
        if (overwriteArmed) router.refresh();
        return;
      }
      setError(res.error);
      toast.error(res.error || "운영안 저장에 실패했습니다.");
      return;
    }
    setSaveConflict(false);
    setOverwriteArmed(false);
    setDiscardArmed(false);
    setPlanUpdatedAt(res.data.updated_at);
    setSaved(true);
    setDirty(false);
    const msg = selectedTemplateId ? "운영안이 저장되었습니다. PPT를 다운로드할 수 있습니다." : "운영안이 저장되었습니다. (템플릿 미선택 — 웹에서만 사용)";
    setNotice(msg);
    toast.success("SNS 채널 운영안이 저장되었습니다.", {
      description: selectedTemplateId ? "이제 상단 버튼에서 PPT를 다운로드할 수 있습니다." : undefined,
    });
    router.refresh();
  };

  // 템플릿 id 만 있는 것으로는 부족하다. 삭제된 템플릿이 걸려 있으면 id 는 그대로 남아 있어
  // 다운로드 버튼이 켜지는데, 누르면 export 가 템플릿을 못 찾아 404 로 떨어진다.
  const canDownload = saved && !dirty && Boolean(selectedTemplate);

  return (
    <div className="p-5 sm:p-7 rounded-3xl bg-surface border border-border space-y-6 shadow-xl font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent2" />
            <span>{account.company_name} SNS 공식 채널 운영 제안서</span>
          </h1>
          <p className="text-xs text-text-sub">
            사전설문 응답을 바탕으로 항목별 AI 초안을 만들고, 저장 후 파워포인트(.pptx)로 다운로드합니다.
            {!hasIntake && <span className="text-warn ml-1">광고주 사전설문 응답이 아직 없어 AI 초안 품질이 낮을 수 있습니다.</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 삭제된 템플릿이 걸려 있으면 AI 도 저장도 막는다. 그대로 부르면 서버가 치환 항목을
              기본값 기준으로 걸러내 "생성할 항목이 없습니다" 처럼 상황과 안 맞는 말을 하게 된다. */}
          <button type="button" disabled={loadingAiAll || templateMissing} onClick={handleAiEmpty} className="px-3.5 py-2 rounded-xl bg-accent2/10 hover:bg-accent2/20 text-accent2 border border-accent2/30 text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50">
            {loadingAiAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>빈 항목만 AI로 채우기</span>
          </button>
          <button type="button" disabled={saving || templateMissing || discardArmed} onClick={handleSave} className="px-4 py-2 rounded-xl bg-accent2 hover:bg-accent2/90 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md transition active:scale-95 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>운영안 저장{dirty ? " *" : ""}</span>
          </button>
          {canDownload ? (
            <DownloadFileButton href={`/sns/${account.id}/plan/export`} label="PPT 다운로드" fallbackFilename="SNS운영제안서.pptx" />
          ) : (
            <span className="text-[11px] text-text-muted">
              {templateMissing
                ? "저장돼 있던 템플릿이 삭제되어 PPT를 만들 수 없습니다."
                : !selectedTemplateId
                ? "템플릿을 선택해야 PPT를 만들 수 있습니다."
                : dirty
                ? "변경 사항을 저장하면 다운로드할 수 있습니다."
                : "저장 후 다운로드할 수 있습니다."}
            </span>
          )}
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">{notice}</div>}

      {(saveConflict || overwriteArmed) && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-warn-soft text-xs space-y-2">
          {overwriteArmed ? (
            <>
              <p className="font-semibold">내 내용으로 덮어쓸 준비가 됐습니다.</p>
              <p className="text-[11px] leading-relaxed">
                다시 [운영안 저장] 을 누르면 다른 사람이 먼저 저장한 내용을 덮어쓰고 저장합니다.
                {saveConflict && " (최신 기준을 아직 받지 못했습니다. 잠시 뒤 한 번 더 눌러주세요.)"}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">내가 이 화면을 연 뒤에 다른 사람이 먼저 저장했습니다.</p>
              <p className="text-[11px] leading-relaxed">
                지금 화면의 내용은 그대로 있습니다. 그대로 저장하면 그 사람의 수정을 덮어씁니다.
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-1.5">
            {!overwriteArmed && (
              <button
                type="button"
                onClick={() => {
                  // 최신 기준 시각을 받아 두고, 저장은 사용자가 한 번 더 누른다.
                  // 덮어쓰기는 사고가 아니라 **선택**이어야 하므로 확인 단계를 남긴다.
                  setOverwriteArmed(true);
                  setSaveConflict(false);
                  router.refresh();
                  toast.info("다시 [운영안 저장] 을 누르면 내 내용으로 덮어씁니다.");
                }}
                className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold transition"
              >
                내 내용으로 덮어쓰기
              </button>
            )}
            <button
              type="button"
              disabled={discardArmed}
              onClick={() => {
                // 서버 값이 도착하는 순간 위쪽 렌더 동기화가 화면을 갈아끼운다.
                // 여기서 지금 props 를 그냥 쓰면, 아직 refresh 가 안 왔을 때 내가 열었을 때의
                // 옛 내용을 "최신" 이라며 보여 주게 된다.
                setDiscardArmed(true);
                router.refresh();
                toast.info("최신 내용을 불러오는 중입니다.");
              }}
              className="px-2 py-1 rounded-lg bg-surface2 hover:bg-surface3 text-text-sub transition disabled:opacity-50"
            >
              {discardArmed ? "불러오는 중..." : "최신 내용 불러오기 (내 수정 버림)"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="sns-plan-template" className="text-xs font-semibold text-text-2">
          적용할 PPT 템플릿 (선택 안 함 = 웹 화면만 사용)
        </label>
        <select
          id="sns-plan-template"
          value={selectedTemplateId || ""}
          onChange={(e) => { setSelectedTemplateId(e.target.value || null); setDirty(true); }}
          className="w-full sm:w-96 px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-accent2 font-semibold"
        >
          <option value="">템플릿 선택 안 함</option>
          {/* 지워진 템플릿이 걸려 있으면 드롭다운이 빈칸으로 보인다. 빈칸 대신 사정을 적어 둔다. */}
          {templateMissing && selectedTemplateId && (
            <option value={selectedTemplateId}>(삭제된 템플릿 — 다시 골라주세요)</option>
          )}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.builtin ? "[기본] " : ""}{t.name} (치환 항목 {t.placeholders.length}개)</option>
          ))}
        </select>
        {templateMissing && (
          <p className="text-[11px] text-warn">
            이 운영안에 저장돼 있던 PPT 템플릿이 삭제되었습니다. 위에서 쓸 템플릿을 다시 고르거나
            &apos;템플릿 선택 안 함&apos; 을 고르면 저장할 수 있습니다. 입력해 둔 내용은 그대로 남아 있습니다.
          </p>
        )}
      </div>

      <div className="space-y-4 pt-3 border-t border-border">
        <h3 className="text-xs font-bold text-text-2">운영안 항목</h3>
        {placeholders.map((ph) => (
          <div key={ph} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor={`sns-plan-field-${ph}`} className="text-xs font-bold text-accent2 font-mono">
                {`{{${ph}}}`}
              </label>
              <button type="button" disabled={loadingAiField === ph || templateMissing} onClick={() => handleAiField(ph)} className="px-2 py-0.5 rounded-lg bg-accent2/10 hover:bg-accent2/20 text-accent2 border border-accent2/20 text-[10px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                {loadingAiField === ph ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI 초안
              </button>
            </div>
            <textarea
              id={`sns-plan-field-${ph}`}
              rows={LONG_FIELDS.has(ph) ? 4 : 2}
              value={fieldValues[ph] || ""}
              onChange={(e) => setField(ph, e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-accent2 leading-relaxed"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
