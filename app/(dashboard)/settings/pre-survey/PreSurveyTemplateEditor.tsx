"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PreSurveyTemplate, PreSurveyQuestion } from "@/lib/db/types";
import { saveTemplateAction } from "./actions";
import { Plus, Trash2, Save, CheckCircle2, Loader2, HelpCircle, MessageSquareText, FileQuestion, ArrowUp, ArrowDown } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import { useFlipList } from "@/lib/hooks/useFlipList";
import { swapItems } from "@/lib/ui/reorder";

export default function PreSurveyTemplateEditor({
  initialTemplate,
}: {
  initialTemplate: PreSurveyTemplate;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<PreSurveyQuestion[]>(initialTemplate.questions || []);
  // 불러온 템플릿의 저장 시각. 저장할 때 같이 보내 다른 사람의 저장을 덮어쓰지 않게 한다.
  // 성공하면 서버가 준 새 시각으로 바꾼다(새로고침 없이 이어서 저장할 수 있게).
  const [templateUpdatedAt, setTemplateUpdatedAt] = useState<string | null>(
    initialTemplate.updated_at ?? null
  );
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 저장하려는데 그 사이 남이 먼저 저장한 상태. 토스트만 띄우면 막다른 길이 된다 —
   * 실패 경로에서는 기준 시각이 안 바뀌므로 **다시 눌러도 영원히 같은 오류**고,
   * 안내대로 새로고침하면 편집하던 문항이 통째로 사라진다.
   * 내 문항은 멀쩡하니 무엇을 할지 고르게만 해 주면 된다(SNS 콘텐츠 모달과 같은 방식).
   */
  const [saveConflict, setSaveConflict] = useState(false);
  /**
   * "내 내용으로 덮어쓰기" 를 고른 상태. 저장할 때 화면이 들고 있는 옛 기준 대신
   * 서버 컴포넌트가 방금 내려준 최신 기준 시각으로 보낸다.
   *
   * SNS 콘텐츠처럼 기준 시각을 null 로 버리는 방법은 여기서 못 쓴다. 단일 행 문서의 잠금
   * (writeWithOptimisticLock)은 **행이 이미 있는데 기준 시각이 없으면 저장 자체를 거부**한다.
   * 그래서 router.refresh() 로 최신 기준을 받아 오는 길을 택했다.
   */
  const [overwriteArmed, setOverwriteArmed] = useState(false);
  /** "최신 내용 불러오기" 를 고른 상태. 새 props 가 도착하면 그 값으로 화면을 갈아끼운다. */
  const [discardArmed, setDiscardArmed] = useState(false);

  // 서버가 새 값을 내려주면(=router.refresh() 가 도착하면) 화면을 다시 맞춘다.
  // effect 가 아니라 렌더 중에 맞춘다. SNS 계정 상세와 같은 방식이고, effect 로 하면
  // 옛 값으로 한 번 그린 뒤 다시 그려 깜빡인다.
  //
  // **평소에는 아무것도 하지 않는다.** 사용자가 "최신 내용 불러오기" 를 고른 순간에만 받아들인다.
  // 아무 refresh 에나 기준 시각을 최신으로 올려 버리면, 남의 저장을 본 적도 없이 덮어쓰게 되어
  // 잠금이 있으나 마나 해진다.
  const [syncedFrom, setSyncedFrom] = useState(initialTemplate);
  if (syncedFrom !== initialTemplate) {
    setSyncedFrom(initialTemplate);
    if (discardArmed) {
      setQuestions(initialTemplate.questions || []);
      setTemplateUpdatedAt(initialTemplate.updated_at ?? null);
      setDiscardArmed(false);
      setSaveConflict(false);
      setOverwriteArmed(false);
      setError(null);
    }
  }

  const { registerRef } = useFlipList(questions);

  const update = (id: string, patch: Partial<PreSurveyQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= questions.length) return;
    const movedItem = questions[idx];
    if (movedItem) {
      setRecentlyMovedId(movedItem.id);
      setTimeout(() => setRecentlyMovedId(null), 500);
    }
    setQuestions((prev) => swapItems(prev, idx, target));
  };

  const handleAdd = () => {
    setQuestions((prev) => [
      ...prev,
      { id: `q_${Date.now()}`, question: "", type: "textarea", required: true, placeholder: "" },
    ]);
  };

  const handleRemove = (id: string) => {
    if (questions.length <= 1) {
      setError("최소 1개 이상의 사전조사 질문이 필요합니다.");
      toast.warning("최소 1개 이상의 사전조사 질문이 필요합니다.");
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    // 덮어쓰기를 골랐으면 서버 컴포넌트가 방금 받아 온 최신 기준 시각으로 저장한다.
    // 아직 안 왔으면 옛 기준 그대로라 또 충돌이 나는데, 그건 막다른 길이 아니라
    // "조금 뒤 한 번 더" 로 풀리는 상태다(아래 실패 경로에서 refresh 를 다시 건다).
    const baseline = overwriteArmed ? (initialTemplate.updated_at ?? templateUpdatedAt) : templateUpdatedAt;
    const res = await safeCall(saveTemplateAction(questions, baseline));
    setSaving(false);
    if (!res.ok) {
      // 충돌은 실패와 다르다. 내 문항은 멀쩡하고, 무엇을 할지 고르기만 하면 된다.
      if ((res.error || "").includes("먼저 저장했습니다")) {
        setSaveConflict(true);
        setError(null);
        // 덮어쓰기를 골랐는데도 충돌이면 최신 기준이 아직 안 온 것이다. 한 번 더 요청해 둔다.
        if (overwriteArmed) router.refresh();
        return;
      }
      setError(res.error);
      toast.error(res.error || "템플릿 저장에 실패했습니다.");
      return;
    }
    setSaveConflict(false);
    setOverwriteArmed(false);
    setDiscardArmed(false);
    setQuestions(res.data.questions);
    setTemplateUpdatedAt(res.data.updated_at);
    router.refresh();
    setSaved(true);
    toast.success("사전조사 표준 템플릿이 저장되었습니다.", {
      description: "기본 문항으로 설정되어 모든 캠페인에 즉시 적용됩니다.",
    });
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              <FileQuestion className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text flex items-center gap-2">
                <span>표준 사전조사 문항</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold">
                  총 {questions.length}개 문항
                </span>
              </h2>
              <p className="text-xs text-text-sub mt-0.5">광고주가 사전조사 링크를 열었을 때 순서대로 보여지는 질문과 입력 예시입니다.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className="px-4 py-2.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 hover:border-blue-500/60 text-blue-400 text-xs font-bold inline-flex items-center gap-1.5 transition shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>새 질문 문항 추가</span>
          </button>
        </div>

        {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}

        {(saveConflict || overwriteArmed) && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-warn-soft text-xs space-y-2">
            {overwriteArmed ? (
              <>
                <p className="font-semibold">내 문항으로 덮어쓸 준비가 됐습니다.</p>
                <p className="text-[11px] leading-relaxed">
                  다시 [템플릿 저장하기] 를 누르면 다른 사람이 먼저 저장한 내용을 덮어쓰고 저장합니다.
                  {saveConflict && " (최신 기준을 아직 받지 못했습니다. 잠시 뒤 한 번 더 눌러주세요.)"}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">내가 이 화면을 연 뒤에 다른 사람이 먼저 저장했습니다.</p>
                <p className="text-[11px] leading-relaxed">
                  지금 화면의 문항은 그대로 있습니다. 그대로 저장하면 그 사람의 수정을 덮어씁니다.
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
                    toast.info("다시 [템플릿 저장하기] 를 누르면 내 문항으로 덮어씁니다.");
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

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              ref={registerRef(q.id)}
              className={`group p-5 sm:p-6 rounded-2xl bg-bg border space-y-4 shadow-md transition-[border-color,box-shadow] duration-200 ${
                recentlyMovedId === q.id
                  ? "border-blue-500 ring-2 ring-blue-500/20 shadow-lg"
                  : "border-border hover:border-blue-500/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/25 tracking-wide">
                    Q{idx + 1}
                  </span>
                  <div className="flex items-center gap-0.5 bg-surface rounded-lg p-0.5 border border-border">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 text-text-muted hover:text-text disabled:opacity-20 rounded hover:bg-surface2 btn-press transition"
                      title="위로 이동"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === questions.length - 1}
                      className="p-1 text-text-muted hover:text-text disabled:opacity-20 rounded hover:bg-surface2 btn-press transition"
                      title="아래로 이동"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-text-sub hover:text-text cursor-pointer">
                    <input type="checkbox" checked={q.required} onChange={(e) => update(q.id, { required: e.target.checked })} className="accent-blue-600 w-3.5 h-3.5 rounded" />
                    <span>필수 응답</span>
                  </label>
                  <button type="button" title="문항 삭제" onClick={() => handleRemove(q.id)} className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text flex items-center gap-1.5">
                    <MessageSquareText className="w-3.5 h-3.5 text-blue-400" />
                    <span>질문 제목 (광고주에게 전달될 질문)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={q.question}
                    onChange={(e) => update(q.id, { question: e.target.value })}
                    placeholder="예: 이번 캠페인에서 홍보하고자 하는 제품/서비스의 핵심 특징은 무엇인가요?"
                    className="w-full px-4 py-2.5 rounded-xl bg-surface border border-border text-text text-xs font-semibold focus:outline-none focus:border-blue-500 transition placeholder:text-text-faint"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-sub flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-text-muted" />
                    <span>답변 작성 가이드 및 예시 텍스트 (플레이스홀더)</span>
                  </label>
                  <input
                    type="text"
                    value={q.placeholder || ""}
                    onChange={(e) => update(q.id, { placeholder: e.target.value })}
                    placeholder="예: 히알루론산 10중 배합으로 72시간 지속되는 강력한 수분 보습력"
                    className="w-full px-4 py-2 rounded-xl bg-surface border border-border text-text-2 text-xs focus:outline-none focus:border-blue-500 transition placeholder:text-text-faint"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            {saved ? (
              <span className="text-xs text-blue-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> 기본 템플릿이 성공적으로 저장되었습니다!
              </span>
            ) : (
              <span className="text-xs text-text-muted">저장 즉시 모든 캠페인의 사전조사 링크에 반영됩니다. 기존 답변은 질문 ID 기준으로 유지됩니다.</span>
            )}
          </div>

          {/* 최신 내용을 받아 오는 중에 저장을 누르면, 받아 온 값이 곧바로 화면을 갈아끼워
              무엇을 저장한 것인지 알 수 없게 된다. 그동안만 저장을 잠근다. */}
          <button
            type="button"
            disabled={saving || discardArmed}
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition disabled:opacity-50 inline-flex items-center justify-center gap-2 shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>템플릿 저장하기</span>
          </button>
        </div>
      </div>
    </div>
  );
}
