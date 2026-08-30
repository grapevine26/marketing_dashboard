"use client";

import { useState } from "react";
import { SnsChannel, SnsPost, SnsPostStatus } from "@/lib/db/types";
import { updatePostStatusAction } from "./actions";
import {
  Calendar,
  ExternalLink,
  Share2,
  CheckCircle2,
  Clock,
  Camera,
  Copy,
  Check,
} from "lucide-react";

export default function SnsCalendarView({
  channels,
  initialPosts,
}: {
  channels: SnsChannel[];
  initialPosts: SnsPost[];
}) {
  const [posts, setPosts] = useState<SnsPost[]>(initialPosts);
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const handleStatusChange = async (postId: string, newStatus: SnsPostStatus) => {
    await updatePostStatusAction({ postId, status: newStatus });
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: newStatus } : p))
    );
  };

  const filteredPosts = posts.filter((p) => {
    if (selectedChannel !== "all" && p.channel_id !== selectedChannel) return false;
    return true;
  });

  const getReviewUrl = (token: string) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/sns/review/${token}`;
    }
    return `http://localhost:3000/sns/review/${token}`;
  };

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(getReviewUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedChannel("all")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
            selectedChannel === "all"
              ? "bg-sky-600 text-white shadow-sm"
              : "bg-[#131418] border border-[#22242A] text-zinc-400 hover:text-white"
          }`}
        >
          전체 채널 ({posts.length})
        </button>
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setSelectedChannel(ch.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
              selectedChannel === ch.id
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-[#131418] border border-[#22242A] text-zinc-400 hover:text-white"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{ch.name} (@{ch.handle})</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredPosts.map((p) => {
          const ch = channels.find((c) => c.id === p.channel_id);
          return (
            <div
              key={p.id}
              className="p-5 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 flex flex-col justify-between shadow-xl"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[11px] font-semibold uppercase">
                    {p.content_type}
                  </span>
                  <span className="text-xs text-zinc-400 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {p.scheduled_date} {p.scheduled_time}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-zinc-500 font-medium">
                    {ch?.name || "SNS 채널"}
                  </span>
                  <h3 className="text-base font-bold text-zinc-100 leading-snug mt-0.5">
                    {p.title}
                  </h3>
                </div>

                <div className="p-3 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2 text-xs">
                  <div>
                    <span className="text-zinc-500 font-semibold block text-[10px]">
                      비주얼 시안 설명:
                    </span>
                    <p className="text-zinc-300 line-clamp-2">{p.visual_description}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-semibold block text-[10px]">
                      캡션 카피:
                    </span>
                    <p className="text-zinc-300 line-clamp-3 whitespace-pre-line">
                      {p.caption_copy}
                    </p>
                  </div>
                  {p.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {p.hashtags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded bg-[#181A20] text-sky-400 text-[10px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {p.client_feedback && (
                  <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-900/40 text-xs text-amber-300 space-y-0.5">
                    <span className="font-semibold text-[10px] block text-amber-400">
                      광고주 검수 피드백:
                    </span>
                    <p>{p.client_feedback}</p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#22242A] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={p.status}
                    onChange={(e) =>
                      handleStatusChange(p.id, e.target.value as SnsPostStatus)
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="draft">기획중 (초안)</option>
                    <option value="review">광고주 검수중</option>
                    <option value="approved">컨펌/승인완료</option>
                    <option value="published">발행완료</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleCopy(p.review_token)}
                    className="px-2.5 py-1.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-medium inline-flex items-center gap-1 transition"
                  >
                    {copiedToken === p.review_token ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-blue-400">복사됨</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5" />
                        <span>검수링크 복사</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}