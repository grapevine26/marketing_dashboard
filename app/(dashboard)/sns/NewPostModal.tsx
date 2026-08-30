"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SnsChannel } from "@/lib/db/types";
import { createSnsPostAction, generateAiCaptionAction } from "./actions";
import { Plus, X, Sparkles, Loader2 } from "lucide-react";

export default function NewPostModal({ channels }: { channels: SnsChannel[] }) {
  const [open, setOpen] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const router = useRouter();

  const [formData, setFormData] = useState({
    channel_id: channels[0]?.id || "",
    scheduled_date: "",
    scheduled_time: "18:00",
    content_type: "reels" as const,
    title: "",
    visual_description: "",
    caption_copy: "",
    hashtags: "#글로우랩 #신제품 #뷰티스타그램",
  });

  const handleAiAssist = async () => {
    if (!formData.title || !formData.visual_description) {
      alert("AI 작성을 위해 콘텐츠 제목과 비주얼 설명을 먼저 입력해주세요.");
      return;
    }

    setLoadingAi(true);
    try {
      const selectedCh = channels.find((c) => c.id === formData.channel_id);
      const res = await generateAiCaptionAction({
        brandName: selectedCh?.company_name || "브랜드",
        contentType: formData.content_type,
        topicTitle: formData.title,
        visualDescription: formData.visual_description,
        platform: selectedCh?.platform || "instagram",
      });

      setFormData((prev) => ({
        ...prev,
        caption_copy: res.captionCopy,
        hashtags: res.hashtags.join(" "),
      }));
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingSubmit(true);
    try {
      const tagArray = formData.hashtags
        .split(" ")
        .map((t) => t.trim())
        .filter(Boolean);

      await createSnsPostAction({
        ...formData,
        hashtags: tagArray,
      });

      setOpen(false);
      router.refresh();
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold shadow-md transition active:scale-95"
      >
        <Plus className="w-4 h-4" />
        <span>새 콘텐츠 기획 등록</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-[#131418] border-t sm:border border-[#22242A] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#22242A]">
              <h2 className="text-base font-bold text-zinc-100">신규 SNS 콘텐츠 기획안 등록</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">운영 채널 *</label>
                  <select
                    value={formData.channel_id}
                    onChange={(e) => setFormData({ ...formData, channel_id: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                  >
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name} (@{ch.handle})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">콘텐츠 유형 *</label>
                  <select
                    value={formData.content_type}
                    onChange={(e) =>
                      setFormData({ ...formData, content_type: e.target.value as any })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500 uppercase"
                  >
                    <option value="reels">릴스 (Reels)</option>
                    <option value="feed">피드 이미지 (Feed)</option>
                    <option value="story">스토리 (Story)</option>
                    <option value="shorts">유튜브 쇼츠 (Shorts)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">발행 예정 일자 *</label>
                  <input
                    type="date"
                    required
                    value={formData.scheduled_date}
                    onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">발행 시간 *</label>
                  <input
                    type="text"
                    required
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                    placeholder="18:00"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">콘텐츠 제목 / 주제 *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="예: 3초 속건조 탈출! 하이드라 세럼 텍스처 릴스"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">비주얼 시안 / 연출 설명 *</label>
                <textarea
                  rows={2}
                  required
                  value={formData.visual_description}
                  onChange={(e) =>
                    setFormData({ ...formData, visual_description: e.target.value })
                  }
                  placeholder="예: 유리볼에 떨어지는 워터리 제형 클로즈업 + 피부 롤링 비포애프터"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[#22242A]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300">캡션 본문 (카피)</label>
                  <button
                    type="button"
                    disabled={loadingAi}
                    onClick={handleAiAssist}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[11px] font-semibold transition active:scale-95"
                  >
                    {loadingAi ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-sky-400" />
                    )}
                    <span>Gemini AI 카피 작성</span>
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={formData.caption_copy}
                  onChange={(e) => setFormData({ ...formData, caption_copy: e.target.value })}
                  placeholder="캡션 본문 내용을 입력하세요."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">해시태그 (공백 구분)</label>
                <input
                  type="text"
                  value={formData.hashtags}
                  onChange={(e) => setFormData({ ...formData, hashtags: e.target.value })}
                  placeholder="#글로우랩 #수분세럼 #올영추천"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-300 text-xs font-medium"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loadingSubmit}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
                >
                  {loadingSubmit ? "등록 중..." : "기획안 등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}