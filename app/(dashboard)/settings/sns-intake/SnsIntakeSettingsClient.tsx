"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SnsIntakeTemplate, PreSurveyQuestion } from "@/lib/db/types";
import { updateSnsIntakeTemplateAction } from "../../sns/actions";
import { Plus, Trash2, Save, CheckCircle2, Loader2, HelpCircle, MessageSquareText, FileQuestion, ArrowUp, ArrowDown } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import { swapItems } from "@/lib/ui/reorder";
import { useUnsavedChanges } from "@/components/PendingSaveGuard";

export default function SnsIntakeSettingsClient({ initialTemplate }: { initialTemplate: SnsIntakeTemplate }) {
  const router = useRouter();
  const [questions, setQuestions] = useState<PreSurveyQuestion[]>(initialTemplate.questions);
  // 불러온 템플릿의 저장 시각. 저장할 때 같이 보내 다른 사람의 저장을 덮어쓰지 않게 한다.
  // 성공하면 서버가 준 새 시각으로 바꾼다(새로고침 없이 이어서 저장할 수 있게).
  const [templateUpdatedAt, setTemplateUpdatedAt] = useState<string | null>(
    initialTemplate.updated_at ?? null
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 마지막으로 저장된 문항. 지금 화면이 여기서 벗어나 있으면 저장 안 한 변경이 있는 것이다.
   * (사전조사 편집기와 같은 방식 — 문자열로 비교해야 문항 안의 글자 변화까지 잡는다.)
   */
  const [baselineJson, setBaselineJson] = useState(() => JSON.stringify(initialTemplate.questions));

  /**
   * 저장 안 한 문항이 있으면 화면을 빠져나가기 전에 붙잡는다.
   * 새로고침·탭 닫기는 브라우저 경고로, 사이드바 이동은 확인창으로 막힌다.
   */
  useUnsavedChanges(JSON.stringify(questions) !== baselineJson);

  const update = (id: string, patch: Partial<PreSurveyQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const move = (idx: number, dir: -1 | 1) =>
    setQuestions((prev) => swapItems(prev, idx, idx + dir));

  const handleAdd = () => {
    setQuestions((prev) => [...prev, { id: `sq_${Date.now()}`, question: "", required: true, placeholder: "" }]);
  };

  const handleRemove = (id: string) => {
    if (questions.length <= 1) {
      setError("최소 1개 이상의 사전설문 질문이 필요합니다.");
      toast.warning("최소 1개 이상의 사전설문 질문이 필요합니다.");
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await safeCall(updateSnsIntakeTemplateAction(questions, templateUpdatedAt));
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      toast.error(res.error || "템플릿 저장에 실패했습니다.");
      return;
    }
    setQuestions(res.data.questions);
    // 저장된 내용이 새 기준이다. 여기를 안 옮기면 저장한 뒤에도 계속 붙잡는다.
    setBaselineJson(JSON.stringify(res.data.questions));
    setTemplateUpdatedAt(res.data.updated_at);
    router.refresh();
    setSaved(true);
    toast.success("SNS 사전설문 표준 템플릿이 저장되었습니다.", {
      description: "기본 문항으로 설정되어 모든 SNS 계정에 즉시 적용됩니다.",
    });
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent2/10 border border-accent2/20 text-accent2 flex items-center justify-center font-bold">
              <FileQuestion className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text flex items-center gap-2">
                <span>표준 사전설문 문항</span>
                <span className="px-2 py-0.5 rounded-full bg-accent2/15 text-accent2 border border-accent2/30 text-xs font-semibold">
                  총 {questions.length}개 문항
                </span>
              </h2>
              <p className="text-xs text-text-sub mt-0.5">광고주가 사전설문 링크를 열었을 때 순서대로 보여지는 질문과 입력 예시입니다.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className="px-4 py-2.5 rounded-xl bg-accent2/10 hover:bg-accent2/20 border border-accent2/30 hover:border-accent2/60 text-accent2 text-xs font-bold inline-flex items-center gap-1.5 transition shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>새 질문 문항 추가</span>
          </button>
        </div>

        {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="group p-5 sm:p-6 rounded-2xl bg-bg border border-border hover:border-accent2/40 transition-all space-y-4 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-accent2/10 text-accent2 border border-accent2/25 tracking-wide">
                    Q{idx + 1}
                  </span>
                  <div className="flex items-center gap-0.5 bg-surface rounded-lg p-0.5 border border-border">
                    <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 text-text-muted hover:text-text disabled:opacity-20 rounded hover:bg-surface2 btn-press transition" title="위로 이동"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => move(idx, 1)} disabled={idx === questions.length - 1} className="p-1 text-text-muted hover:text-text disabled:opacity-20 rounded hover:bg-surface2 btn-press transition" title="아래로 이동"><ArrowDown className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-text-sub hover:text-text cursor-pointer">
                    <input type="checkbox" checked={q.required} onChange={(e) => update(q.id, { required: e.target.checked })} className="accent-accent2 w-3.5 h-3.5 rounded" />
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
                    <MessageSquareText className="w-3.5 h-3.5 text-accent2" />
                    <span>질문 제목 (광고주에게 전달될 질문)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={q.question}
                    onChange={(e) => update(q.id, { question: e.target.value })}
                    placeholder="예: 브랜드 톤앤매너와 핵심 고객 페르소나는 어떻게 되나요?"
                    className="w-full px-4 py-2.5 rounded-xl bg-surface border border-border text-text text-xs font-semibold focus:outline-none focus:border-accent2 transition placeholder:text-text-faint"
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
                    placeholder="예: 20대 대학생/사회초년생, 친근하고 트렌디한 무드"
                    className="w-full px-4 py-2 rounded-xl bg-surface border border-border text-text-2 text-xs focus:outline-none focus:border-accent2 transition placeholder:text-text-faint"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            {saved ? (
              <span className="text-xs text-accent2 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> 기본 템플릿이 성공적으로 저장되었습니다!
              </span>
            ) : (
              <span className="text-xs text-text-muted">저장 즉시 모든 SNS 계정의 사전설문 링크에 반영됩니다. 기존 답변은 질문 ID 기준으로 유지됩니다.</span>
            )}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-accent2 hover:bg-accent2/90 text-white text-xs font-bold shadow-lg shadow-accent2/25 transition disabled:opacity-50 inline-flex items-center justify-center gap-2 shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>템플릿 저장하기</span>
          </button>
        </div>
      </div>
    </div>
  );
}
