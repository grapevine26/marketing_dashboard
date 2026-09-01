"use client";

import { useState } from "react";
import { SnsAccount, SnsIntakeTemplate, SnsIntakeResponse } from "@/lib/db/types";
import { submitSnsIntakeAction } from "@/app/(dashboard)/sns/actions";
import { CheckCircle2, Loader2, Send } from "lucide-react";

export default function SnsIntakeFormClient({
  token,
  account,
  template,
  existingResponse,
}: {
  token: string;
  account: SnsAccount;
  template: SnsIntakeTemplate;
  existingResponse: SnsIntakeResponse | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    existingResponse?.answers || {}
  );
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitSnsIntakeAction({
        token,
        accountId: account.id,
        answers,
      });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-8 text-center space-y-3 bg-[#090A0C] rounded-2xl border border-sky-500/20">
        <CheckCircle2 className="w-12 h-12 text-sky-400 mx-auto" />
        <h2 className="text-base font-bold text-zinc-100">설문이 성공적으로 접수되었습니다!</h2>
        <p className="text-xs text-zinc-400">
          제출해주신 내용을 바탕으로 전문적이고 트렌디한 SNS 운영안 및 콘텐츠를 기획하여 안내드리겠습니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {template.questions.map((q, idx) => (
        <div key={q.id} className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
            <span>
              {idx + 1}. {q.question} {q.required && <strong className="text-sky-400">*</strong>}
            </span>
          </label>
          <textarea
            required={q.required}
            rows={3}
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            placeholder={q.placeholder || "내용을 입력해주세요."}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500 leading-relaxed"
          />
        </div>
      ))}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold shadow-lg transition active:scale-98 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        <span>{existingResponse ? "설문 내용 수정하여 다시 제출" : "사전설문 제출하기"}</span>
      </button>
    </form>
  );
}