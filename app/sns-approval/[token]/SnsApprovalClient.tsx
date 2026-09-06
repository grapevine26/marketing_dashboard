"use client";

import { useState } from "react";
import { PublicSnsAccount, ReviewableSnsContent } from "@/lib/db/types";
import { reviewSnsContentByTokenAction } from "./actions";
import { CheckCircle2, AlertCircle, MessageSquare, Loader2 } from "lucide-react";

export default function SnsApprovalClient({
  token,
  account,
  initialContents,
}: {
  token: string;
  account: PublicSnsAccount;
  initialContents: ReviewableSnsContent[];
}) {
  const [contents, setContents] = useState<ReviewableSnsContent[]>(initialContents);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; decision: string }[]>([]);

  const handleReview = async (c: ReviewableSnsContent, decision: "approve" | "request_changes") => {
    setError(null);
    const comment = comments[c.id]?.trim();
    if (decision === "request_changes" && !comment) {
      setError("수정 요청 사항을 입력해주세요.");
      return;
    }
    if (decision === "approve" && !confirm(`"${c.title}" 시안을 승인할까요?`)) return;

    setLoadingId(c.id);
    const res = await reviewSnsContentByTokenAction({ token, contentId: c.id, decision, comment });
    setLoadingId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setContents((prev) => prev.filter((x) => x.id !== c.id));
    setDone((prev) => [
      ...prev,
      { title: c.title, decision: res.data.changed ? (decision === "approve" ? "승인 완료" : "수정 요청 전달") : "이미 처리된 시안" },
    ]);
  };

  return (
    <div className="space-y-4">
      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}

      {done.length > 0 && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs space-y-1">
          {done.map((d, i) => (
            <div key={i}>✓ {d.title} — {d.decision}</div>
          ))}
        </div>
      )}

      {contents.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-[#131418] border border-dashed border-[#22242A] text-zinc-500 text-xs">
          현재 {account.company_name} 계정에 검토 대기 중인 콘텐츠 시안이 없습니다.
        </div>
      ) : (
        contents.map((c) => (
          <div key={c.id} className="p-6 rounded-3xl border bg-[#131418] border-sky-500/40 transition space-y-4 shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">광고주 승인 대기중</span>
                <span className="text-xs text-zinc-500 font-mono">발행 예정: {c.scheduled_on || "미정"}</span>
              </div>
              <h2 className="text-base font-bold text-zinc-100">{c.title}</h2>
            </div>

            <div className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2 text-xs">
              <span className="text-[11px] font-bold text-zinc-400 block">원고 및 캡션:</span>
              <p className="text-zinc-200 leading-relaxed whitespace-pre-line">{c.caption || "작성된 캡션이 없습니다."}</p>
              {c.hashtags && <p className="text-sky-400 font-medium">{c.hashtags}</p>}
            </div>

            {c.client_comment && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div><strong>이전 수정 요청:</strong> {c.client_comment}</div>
              </div>
            )}

            <div className="pt-3 border-t border-[#22242A] space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  placeholder="수정 요청 사항 (수정 요청 시 필수, 예: 2번째 줄 문구 수정)"
                  value={comments[c.id] || ""}
                  onChange={(e) => setComments({ ...comments, [c.id]: e.target.value })}
                  className="w-full sm:flex-1 px-3.5 py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                />
                <div className="flex w-full sm:w-auto items-center gap-2">
                  <button
                    type="button"
                    disabled={loadingId === c.id}
                    onClick={() => handleReview(c, "request_changes")}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-[#181A20] hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    {loadingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    <span>수정 요청</span>
                  </button>
                  <button
                    type="button"
                    disabled={loadingId === c.id}
                    onClick={() => handleReview(c, "approve")}
                    className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    {loadingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>시안 승인 (컨펌)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
