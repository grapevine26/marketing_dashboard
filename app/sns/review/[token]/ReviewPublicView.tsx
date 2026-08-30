"use client";

import { useState } from "react";
import { SnsPost } from "@/lib/db/types";
import { submitClientReviewAction } from "./actions";
import { CheckCircle2, MessageSquare, Send, Loader2 } from "lucide-react";

export default function ReviewPublicView({ post }: { post: SnsPost }) {
  const [feedback, setFeedback] = useState(post.client_feedback || "");
  const [currentStatus, setCurrentStatus] = useState(post.status);
  const [submitting, setSubmitting] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  const handleDecision = async (status: "approved" | "review") => {
    setSubmitting(true);
    try {
      await submitClientReviewAction({
        token: post.review_token,
        status,
        feedback,
      });
      setCurrentStatus(status);
      setSubmittedMessage(
        status === "approved"
          ? "콘텐츠 시안이 승인(컨펌)되었습니다. 예정된 일정에 맞춰 발행을 준비하겠습니다!"
          : "수정 요청 피드백이 에이전시 담당자에게 전달되었습니다."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-6 shadow-2xl font-sans">
      <div className="space-y-4">
        <div className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2">
          <span className="text-[11px] font-semibold text-zinc-400 block">
            [1] 비주얼 연출 / 디자인 시안 설명:
          </span>
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
            {post.visual_description}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2">
          <span className="text-[11px] font-semibold text-zinc-400 block">
            [2] 캡션 본문 (카피라이팅):
          </span>
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line font-normal">
            {post.caption_copy}
          </p>
          {post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2 border-t border-[#181A20]">
              {post.hashtags.map((tag, idx) => (
                <span key={idx} className="text-xs text-sky-400">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {submittedMessage ? (
        <div className="p-4 rounded-2xl bg-sky-950/30 border border-sky-800 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-sky-400 mx-auto" />
          <p className="text-xs text-sky-300 font-medium">{submittedMessage}</p>
        </div>
      ) : (
        <div className="space-y-4 pt-2 border-t border-[#22242A]">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>검수 피드백 및 수정 요청 사항 (선택)</span>
            </label>
            <textarea
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="카피 수정 또는 연출 변경 요청이 있을 경우 자유롭게 기재해주세요."
              className="w-full px-3 py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleDecision("review")}
              className="py-3 rounded-2xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold border border-[#22242A] transition disabled:opacity-50"
            >
              수정 요청 전달하기
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleDecision("approved")}
              className="py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-500/25 transition disabled:opacity-50"
            >
              시안 승인 (컨펌 완료) ✓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}