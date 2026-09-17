"use client";

import { useState } from "react";
import { Campaign, CampaignFormConfig, CustomQuestion, CustomQuestionType, isSharedWithCompany } from "@/lib/db/types";
import { saveFormConfigAction, generateAiIntroAction } from "./actions";
import {
  Sparkles,
  Save,
  Plus,
  Trash2,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  ExternalLink,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import Link from "next/link";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import { useFlipList } from "@/lib/hooks/useFlipList";
import { swapItems } from "@/lib/ui/reorder";

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
  // 저장된 소개글이 없을 때 깔아 두는 자동 문구. 아래 AI 초안에서 "사람이 써 둔 글인지" 가리는 데도 쓴다.
  const defaultIntroText = `안녕하세요! ${campaign.company_name}의 신규 캠페인 '${campaign.name}' 인플루언서 체험단을 모집합니다.`;
  const [introText, setIntroText] = useState(initialConfig?.intro_text || defaultIntroText);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>(initialConfig?.custom_questions || []);
  const [isPublished, setIsPublished] = useState(initialConfig?.is_published ?? true);
  // 방금 위/아래로 옮긴 질문. 잠깐 테두리를 밝혀 어느 것이 움직였는지 눈으로 좇게 한다.
  // 사전조사 편집기(CampaignPreSurveyQuestionEditor)와 같은 방식이다.
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);

  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAiIntro = async () => {
    // AI 초안은 소개글을 통째로 갈아엎는다. 되돌리기가 없으니 먼저 물어본다.
    // 저장된 적 없는 자동 기본 문구만 남아 있으면 잃을 것이 없어 묻지 않는다 —
    // 처음 만드는 사람이 매번 확인창을 보면 확인창을 읽지 않고 누르는 습관만 생긴다.
    const isUntouchedDefault = !initialConfig && introText === defaultIntroText;
    if (
      introText.trim() !== "" &&
      !isUntouchedDefault &&
      !window.confirm("지금 써 둔 모집 소개글이 AI 초안으로 덮어쓰기 됩니다. 계속할까요?")
    ) {
      return;
    }
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

  /**
   * 선택지 입력칸에 **친 그대로** 담아두는 글자.
   *
   * 전에는 입력칸 값을 `options.join(", ")` 으로 만들고, 칠 때마다 쉼표로 쪼개
   * `filter(Boolean)` 으로 빈 조각을 버렸다. 그래서 `건성` 까지 치고 쉼표를 누르면
   * `["건성", ""]` → 빈 조각이 버려짐 → `["건성"]` → 다시 `"건성"` 이 되어
   * **화면에서 쉼표가 사라졌다.** 제어 입력이라 React 가 DOM 값을 되돌리기 때문이다.
   * 결과적으로 **선택지를 두 개 이상 만들 수가 없었다**(다른 데서 통째로 붙여넣으면
   * 되기 때문에 만든 사람은 동작한다고 착각한다).
   *
   * 그래서 보여주는 글자와 저장할 배열을 분리한다. 화면은 사람이 친 것을 그대로 보여주고,
   * 배열은 거기서 따로 뽑는다. 아직 아무것도 안 친 질문은 저장된 값을 보여준다.
   */
  const [optionText, setOptionText] = useState<Record<string, string>>({});

  // 순서를 바꾸면 카드가 스르륵 자리를 옮긴다. 번호만 휙 바뀌면 어느 줄이 움직였는지 놓친다.
  const { registerRef } = useFlipList(customQuestions);

  const updateQuestion = (id: string, patch: Partial<CustomQuestion>) => {
    setCustomQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  /**
   * 질문을 한 칸 위/아래로 옮긴다.
   *
   * 이 편집기에는 원래 순서 변경이 없었다. 그래서 순서를 고치려면 지웠다 다시 만드는 수밖에
   * 없었고, 그 순간 아래 `handleRemoveQuestion` 이 설명하는 사고(이미 들어온 답변이 화면에서
   * 사라짐)를 정면으로 밟았다. **순서 변경이 곧 데이터 보호다.**
   *
   * 자리 맞바꾸기는 `swapItems` 에 맡긴다 — 범위 검사를 각자 구현하다가 배열에 undefined 가
   * 박힌 전례가 있어 한 군데로 모아 둔 함수다.
   */
  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= customQuestions.length) return;
    const movedItem = customQuestions[idx];
    if (movedItem) {
      setRecentlyMovedId(movedItem.id);
      setTimeout(() => setRecentlyMovedId(null), 500);
    }
    setCustomQuestions((prev) => swapItems(prev, idx, target));
  };

  const handleAddQuestion = () => {
    setCustomQuestions((prev) => [
      ...prev,
      // 새 질문은 **광고주에게 안 보이는 것이 기본**이다. 반대로 두면 "카카오톡 ID" 같은 걸
      // 물어보면서 체크를 깜빡하는 순간 지원자 전원의 값이 광고주에게 나간다.
      // 보여줘야 하는 질문은 만들 때 한 번 눌러 주면 된다.
      //
      // id 는 난수로 만든다. 예전에는 `cq_${Date.now()}` 였는데, [질문 추가]를 빠르게 두 번
      // 누르면 같은 밀리초가 나와 **id 가 겹쳤다.** 겹친 질문 둘은 답변이 담기는 자리
      // (`custom_answers` 의 키)까지 같아 한쪽이 다른 쪽을 덮어썼다.
      // 저장 쪽 검사(`requireText(q.id, "문항 ID", 100)`)는 비어 있지 않은 100자 이하 문자열이면
      // 다 받으므로 옛 `cq_...` id 와 섞여 있어도 그대로 굴러간다. id 를 파싱하는 곳도 없다.
      { id: crypto.randomUUID(), label: "", type: "text", required: false, share_with_company: false },
    ]);
  };

  const handleRemoveQuestion = (id: string) => {
    // 질문을 지우면 **이미 들어온 답변이 보이지 않게 된다.** 답 자체는 지원자 행의
    // `custom_answers` 에 남지만, 그것을 읽는 곳(지원자 목록 화면 · CSV · 엑셀 · 광고주 공유)이
    // 전부 "지금 질문 목록" 을 기준으로 그린다. 같은 이름으로 다시 만들어도 새 id 가 붙어 빈 칸이다.
    // 휴지통은 다른 입력칸 바로 옆에 있어 잘못 누르기 쉬우므로 한 번 물어본다.
    // (캠페인 삭제처럼 이름을 옮겨 적게 하지는 않는다 — 저장을 누르기 전까지는 되돌릴 수 있고,
    //  지운 답도 지원자 화면에서는 계속 보이기 때문에 그 정도로 무거운 확인은 과하다.)
    const target = customQuestions.find((q) => q.id === id);
    const label = target?.label.trim();
    if (
      !window.confirm(
        `${label ? `"${label}"` : "이 "} 문항을 삭제할까요?\n\n` +
          "이미 접수된 지원자가 이 문항에 적어 낸 답변이 지원자 목록 화면과 CSV·엑셀 내려받기, " +
          "광고주 공유 페이지에서 더 이상 보이지 않게 됩니다. 같은 이름으로 다시 만들어도 빈 칸이라 되돌릴 수 없습니다.\n\n" +
          "(지운 답변은 지원자 관리 화면에서 이름을 눌러 펼치면 \"지금 없는 질문\" 으로 확인할 수 있습니다. " +
          "삭제는 [신청폼 설정 저장] 을 눌러야 반영됩니다.)"
      )
    ) {
      return;
    }
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
      toast.error(res.error || "신청폼 저장에 실패했습니다.");
      return;
    }
    setCustomQuestions(res.data.custom_questions);
    setSaved(true);
    toast.success("인플루언서 신청폼 설정이 저장되었습니다.", {
      description: "공개 지원 페이지에 즉시 적용됩니다.",
    });
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans">
      {/* 상단 브레드크럼 네비게이션 */}
      <div className="flex items-center gap-2 text-xs text-text-sub">
        <Link
          href={`/campaigns/${campaign.id}`}
          className="hover:text-accent-link flex items-center gap-1 transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>{campaign.name} 허브</span>
        </Link>
        <span>/</span>
        <span className="text-text">인플루언서 지원폼 설정</span>
      </div>

      <div className="space-y-1">
        {/* 상단 소속 캠페인 안내 라벨 */}
        <div className="flex items-center gap-2 text-xs text-text-sub">
          <span className="px-2 py-0.5 rounded-md bg-surface2 border border-border font-medium text-text-2">
            {campaign.company_name}
          </span>
          <span className="font-semibold text-accent-link">
            {campaign.name}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-text tracking-tight">인플루언서 지원폼 설정</h1>
          <a href={applyPath} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 font-semibold">
            <ExternalLink className="w-3.5 h-3.5" /> 공개 신청폼 미리보기
          </a>
        </div>
        <p className="text-sm text-text-sub">
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
            aria-label="모집 소개글"
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
              {/* 깜빡하고 안 켠 질문이 눈에 띄게, 반대로 켜 둔 것도 한눈에 보이게 한다.
                  체크박스만 있으면 질문이 늘었을 때 어느 게 나가는지 세어보지 않으면 모른다. */}
              <p className="text-[11px] text-text-muted">
                광고주에게 보이는 질문{" "}
                <strong className="text-warn-soft font-semibold">
                  {customQuestions.filter(isSharedWithCompany).length}개
                </strong>
                {" · "}우리만 보는 질문{" "}
                <strong className="text-text-sub font-semibold">
                  {customQuestions.filter((q) => !isSharedWithCompany(q)).length}개
                </strong>
                {" — "}지원자가 쓴 <strong className="text-text-sub">답</strong>이 광고주 화면과 내려받기 파일에 나갑니다.
                연락처·주소·생년월일 같은 건 켜지 마세요.
              </p>
              {customQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  ref={registerRef(q.id)}
                  className={`p-4 rounded-xl bg-bg border space-y-2 transition-[border-color,box-shadow] duration-200 ${
                    recentlyMovedId === q.id ? "border-blue-500 ring-2 ring-blue-500/20" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-text-muted">{idx + 1}</span>
                    {/* 순서 변경. 이게 없어서 지웠다 다시 만들다가 답변을 날리는 일이 생겼다. */}
                    <div className="flex items-center gap-0.5 bg-surface rounded-lg p-0.5 border border-border shrink-0">
                      <button
                        type="button"
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-text-muted hover:text-text disabled:opacity-20 rounded hover:bg-surface2 btn-press"
                        title="위로 이동"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, 1)}
                        disabled={idx === customQuestions.length - 1}
                        className="p-1 text-text-muted hover:text-text disabled:opacity-20 rounded hover:bg-surface2 btn-press"
                        title="아래로 이동"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
                    {/* 이 질문의 **답**이 광고주 화면·CSV·엑셀로 나갈지. 켜져 있으면 눈에 띄게 보여준다. */}
                    <label
                      className={`flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap px-2 py-1 rounded-lg border transition ${
                        isSharedWithCompany(q)
                          ? "border-amber-500/40 bg-amber-500/10 text-warn-soft"
                          : "border-border text-text-muted hover:text-text-sub"
                      }`}
                      title="켜면 지원자가 이 칸에 쓴 내용이 광고주 화면과 내려받기 파일에 그대로 나갑니다."
                    >
                      <input
                        type="checkbox"
                        checked={isSharedWithCompany(q)}
                        onChange={(e) => updateQuestion(q.id, { share_with_company: e.target.checked })}
                        className="accent-amber-500"
                      />
                      <span>광고주 공개</span>
                    </label>
                    <button type="button" title="문항 삭제" onClick={() => handleRemoveQuestion(q.id)} className="p-1.5 text-text-muted hover:text-red-400 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {q.type === "select" && (
                    <input
                      type="text"
                      value={optionText[q.id] ?? (q.options || []).join(", ")}
                      onChange={(e) => {
                        // 친 글자를 **그대로** 들고 있는다. 저장용 배열은 따로 만든다.
                        setOptionText((prev) => ({ ...prev, [q.id]: e.target.value }));
                        updateQuestion(q.id, {
                          options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                        });
                      }}
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
