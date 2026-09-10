"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PreSurveyTemplate, PreSurveyQuestion } from "@/lib/db/types";
import { saveTemplateAction } from "./actions";
import { Plus, Trash2, Save, CheckCircle2, Loader2, HelpCircle, MessageSquareText, FileQuestion, ArrowUp, ArrowDown } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import { useFlipList } from "@/lib/hooks/useFlipList";

export default function PreSurveyTemplateEditor({
  initialTemplate,
}: {
  initialTemplate: PreSurveyTemplate;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<PreSurveyQuestion[]>(initialTemplate.questions || []);
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setQuestions((prev) => {
      const next = [...prev];
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
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
    const res = await safeCall(saveTemplateAction(questions));
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      toast.error(res.error || "템플릿 저장에 실패했습니다.");
      return;
    }
    setQuestions(res.data.questions);
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
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-blue-600 text-white text-xs font-extrabold shadow-sm transition-transform">
                    Q{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="p-1.5 text-text-muted hover:text-text disabled:opacity-20 rounded-lg hover:bg-surface2 btn-press"
                    title="위로 이동"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === questions.length - 1}
                    className="p-1.5 text-text-muted hover:text-text disabled:opacity-20 rounded-lg hover:bg-surface2 btn-press"
                    title="아래로 이동"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
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

          <button
            type="button"
            disabled={saving}
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
