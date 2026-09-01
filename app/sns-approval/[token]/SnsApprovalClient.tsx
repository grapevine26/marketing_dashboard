"use client";

import { useState } from "react";
import { SnsAccount, SnsContent } from "@/lib/db/types";
import { reviewSnsContentAction } from "@/app/(dashboard)/sns/actions";
import { CheckCircle2, AlertCircle, MessageSquare, Loader2 } from "lucide-react";

export default function SnsApprovalClient({
  account,
  initialContents,
}: {
  account: SnsAccount;
  initialContents: SnsContent[];
}) {
  const [contents, setContents] = useState<SnsContent[]>(initialContents);
  const [activeComments, setActiveComments] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleReview = async (contentId: string, decision: "approve" | "request_changes") => {
    setLoadingId(contentId);
    try {
      const comment = activeComments[contentId];
      const res = await reviewSnsContentAction({
        contentId,
        decision,
        comment,
      });
      if (res.content) {
        setContents((prev) =>
          prev.map((c) => (c.id === contentId ? res.content! : c))
        );
      }
    } finally {
      setLoadingId(null);
    }
  };

  if (contents.length === 0) {
    return (
      <div className="p-12 text-center rounded-3xl bg-[#131418] border border-dashed border-[#22242A] text-zinc-500 text-xs">
        현재 검토 대기 중인 콘텐츠 시안이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {contents.map((c) => {
        const isApproved = c.status === "approved";
        const isPending = c.status === "pending_approval";
        const isProducing = c.status === "producing";

        return (
          <div
            key={c.id}
            className={`p-6 rounded-3xl border transition space-y-4 shadow-xl ${
              isApproved
                ? "bg-[#131418] border-emerald-500/30"
                : isPending
                ? "bg-[#131418] border-sky-500/40"
                : "bg-[#131418] border-[#22242A]"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      isApproved
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : isPending
                        ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                        : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {isApproved ? "승인 완료 ✓" : isPending ? "광고주 승인 대기중" : "수정 요청됨 (제작중)"}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">
                    발행 예정: {c.scheduled_on || "미정"}
                  </span>
                </div>
                <h2 className="text-base font-bold text-zinc-100">{c.title}</h2>
              </div>
            </div>

            {/* Caption Preview Box */}
            <div className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2 text-xs">
              <span className="text-[11px] font-bold text-zinc-400 block">원고 및 캡션:</span>
              <p className="text-zinc-200 leading-relaxed whitespace-pre-line">
                {c.caption || "작성된 캡션이 없습니다."}
              </p>
              {c.hashtags && <p className="text-sky-400 font-medium">{c.hashtags}</p>}
              {c.media_note && (
                <div className="pt-2 border-t border-[#181A20] text-zinc-500 text-[11px]">
                  <strong>비주얼 연출 참고:</strong> {c.media_note}
                </div>
              )}
            </div>

            {/* Existing Comment */}
            {c.client_comment && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>요청된 수정사항:</strong> {c.client_comment}
                </div>
              </div>
            )}

            {/* Action Buttons & Comment Input */}
            <div className="pt-3 border-t border-[#22242A] space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  placeholder="수정 요청 사항이 있다면 입력해주세요 (예: 2번째 줄 문구 수정)"
                  value={activeComments[c.id] || ""}
                  onChange={(e) =>
                    setActiveComments({ ...activeComments, [c.id]: e.target.value })
                  }
                  className="w-full sm:flex-1 px-3.5 py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                />
                <div className="flex w-full sm:w-auto items-center gap-2">
                  <button
                    type="button"
                    disabled={loadingId === c.id}
                    onClick={() => handleReview(c.id, "request_changes")}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-[#181A20] hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    {loadingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    <span>수정 요청</span>
                  </button>
                  <button
                    type="button"
                    disabled={loadingId === c.id || isApproved}
                    onClick={() => handleReview(c.id, "approve")}
                    className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    {loadingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>시안 승인 (컨펌)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}