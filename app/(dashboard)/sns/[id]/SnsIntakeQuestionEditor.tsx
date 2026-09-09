"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PreSurveyQuestion } from "@/lib/db/types";
import {
  saveSnsAccountIntakeQuestionsAction,
  resetSnsAccountIntakeQuestionsAction,
} from "../actions";
import {
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Loader2,
  FileQuestion,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";

interface SnsIntakeQuestionEditorProps {
  accountId: string;
  initialQuestions: PreSurveyQuestion[];
  isCustom: boolean;
  defaultTemplateQuestions: PreSurveyQuestion[];
}

export default function SnsIntakeQuestionEditor({
  accountId,
  initialQuestions,
  isCustom: initialIsCustom,
  defaultTemplateQuestions,
}: SnsIntakeQuestionEditorProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<PreSurveyQuestion[]>(initialQuestions || []);
  const [isCustom, setIsCustom] = useState(initialIsCustom);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (id: string, patch: Partial<PreSurveyQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    setError(null);
  };

  const move = (idx: number, dir: -1 | 1) =>
    setQuestions((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const handleAdd = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: `siq_${Date.now()}`,
        question: "",
        type: "textarea",
        required: true,
        placeholder: "",
      },
    ]);
    setError(null);
  };

  const handleRemove = (id: string) => {
    if (questions.length <= 1) {
      setError("최소 1개 이상의 사전설문 질문이 필요합니다.");
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setError(null);
  };

  const handleSave = async () => {
    const emptyQ = questions.find((q) => !q.question.trim());
    if (emptyQ) {
      setError("모든 문항의 질문 내용을 입력해주세요.");
      return;
    }

    setSaving(true);
    setError(null);
    const res = await safeCall(
      saveSnsAccountIntakeQuestionsAction({ accountId, questions })
    );
    setSaving(false);

    if (!res.ok) {
      setError(res.error || "문항 저장에 실패했습니다.");
      return;
    }

    setIsCustom(true);
    setQuestions(res.data.questions);
    router.refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleResetToDefault = async () => {
    if (
      !window.confirm(
        "공통 기본 템플릿 문항으로 초기화하시겠습니까? 이 SNS 계정에 저장된 개별 문항 설정이 삭제되고 공통 템플릿이 적용됩니다."
      )
    ) {
      return;
    }

    setResetting(true);
    setError(null);
    const res = await safeCall(resetSnsAccountIntakeQuestionsAction(accountId));
    setResetting(false);

    if (!res.ok) {
      setError(res.error || "기본 템플릿 초기화에 실패했습니다.");
      return;
    }

    setIsCustom(false);
    setQuestions(defaultTemplateQuestions);
    router.refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent2/10 border border-accent2/20 text-accent2 flex items-center justify-center font-bold">
              <FileQuestion className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-text">SNS 계정 전용 사전설문 문항 설정</h2>
                {isCustom ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                    이 계정 맞춤 문항 적용 중 ({questions.length}개)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-surface2 text-text-sub border border-border text-xs font-semibold">
                    공통 기본 템플릿 적용 중 ({questions.length}개)
                  </span>
                )}
              </div>
              <p className="text-xs text-text-sub mt-1">
                광고주에게 전달되는 공식 채널 사전설문 링크(`/sns-intake/...`)에 노출될 질문 항목을 자유롭게 추가하거나 삭제할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isCustom && (
              <button
                type="button"
                onClick={handleResetToDefault}
                disabled={resetting || saving}
                className="px-3 py-2 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-xs font-medium text-text-sub hover:text-text transition inline-flex items-center gap-1.5 disabled:opacity-50"
                title="공통 기본 템플릿으로 초기화"
              >
                {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>기본 템플릿으로 초기화</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleAdd}
              className="px-3.5 py-2 rounded-xl bg-accent2/10 hover:bg-accent2/20 border border-accent2/30 hover:border-accent2/60 text-accent2 text-xs font-bold inline-flex items-center gap-1.5 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>새 질문 문항 추가</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
            {error}
          </div>
        )}

        {saved && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>사전설문 문항 설정이 성공적으로 저장되었습니다.</span>
          </div>
        )}

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="group p-5 rounded-2xl bg-bg border border-border hover:border-accent2/40 transition-all space-y-3.5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-accent2 text-white text-xs font-extrabold shadow-sm">
                    Q{idx + 1}
                  </span>
                  <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 text-text-muted hover:text-text disabled:opacity-30 rounded hover:bg-surface2 transition"
                      title="위로 이동"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === questions.length - 1}
                      className="p-1 text-text-muted hover:text-text disabled:opacity-30 rounded hover:bg-surface2 transition"
                      title="아래로 이동"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-text-sub cursor-pointer hover:text-text">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => update(q.id, { required: e.target.checked })}
                      className="rounded border-border text-accent2 focus:ring-accent2 w-3.5 h-3.5 bg-surface cursor-pointer"
                    />
                    <span>필수 응답</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemove(q.id)}
                    className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                    title="문항 삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    질문 문구 (광고주에게 표시될 질문)
                  </label>
                  <input
                    type="text"
                    value={q.question}
                    onChange={(e) => update(q.id, { question: e.target.value })}
                    placeholder="예: 브랜드의 공식 계정 운영 목적과 핵심 타겟층을 설명해주세요."
                    className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text text-xs focus:outline-none focus:border-accent2"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-text-muted block mb-1">
                    입력 예시 안내문 (Placeholder)
                  </label>
                  <input
                    type="text"
                    value={q.placeholder || ""}
                    onChange={(e) => update(q.id, { placeholder: e.target.value })}
                    placeholder="예: 2030 직장인 타겟, 트렌디하고 유쾌한 톤앤매너, 매주 화/목 업로드 등"
                    className="w-full px-3.5 py-1.5 rounded-xl bg-surface border border-border text-text text-xs focus:outline-none focus:border-accent2"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-accent2 hover:bg-accent2/90 text-white text-xs font-bold inline-flex items-center gap-1.5 transition shadow-sm active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>이 계정의 문항 저장</span>
          </button>
        </div>
      </div>
    </div>
  );
}
