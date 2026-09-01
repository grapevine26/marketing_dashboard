"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEventAction } from "./actions";
import { Plus, X, Loader2, Sparkles } from "lucide-react";

export default function NewCampaignEventModal({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    event_at: "",
    venue: "",
    memo: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createEventAction({
        campaignId,
        name: formData.name,
        eventAt: formData.event_at || null,
        venue: formData.venue || null,
        memo: formData.memo || null,
      });
      setOpen(false);
      router.push(`/campaigns/${campaignId}/events/${res.event.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-md transition active:scale-95"
      >
        <Plus className="w-4 h-4" />
        <span>새 행사 만들기</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-[#131418] border-t sm:border border-[#22242A] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#22242A]">
              <h2 className="text-base font-bold text-zinc-100">신규 인플루언서 행사 등록</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">행사명 *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 2026 하이드라 앰플 런칭 VIP 프라이빗 뷰티 파티"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">행사 일시</label>
                  <input
                    type="datetime-local"
                    value={formData.event_at}
                    onChange={(e) => setFormData({ ...formData, event_at: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">행사 장소</label>
                  <input
                    type="text"
                    value={formData.venue}
                    onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                    placeholder="예: 서울 성동구 성수이로 88 보테가 성수 2F"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">행사 메모 / 기획 요약</label>
                <textarea
                  rows={3}
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  placeholder="예: 최상위 뷰티 크리에이터 30인 초청, 신제품 제형 체험 및 럭키드로우 세션"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
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
                  disabled={loading}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>행사 생성하기</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}