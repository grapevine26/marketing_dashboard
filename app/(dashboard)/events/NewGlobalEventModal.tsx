"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Campaign } from "@/lib/db/types";
import { createEventAction } from "../campaigns/[id]/events/actions";
import { Plus, X, Loader2, PartyPopper } from "lucide-react";
import Link from "next/link";
import { safeCall } from "@/lib/actions/safeCall";

export default function NewGlobalEventModal({ campaigns }: { campaigns: Campaign[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(campaigns[0]?.id || "");
  const [formData, setFormData] = useState({ name: "", event_at: "", venue: "", memo: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignId) {
      setErrorMsg("연계할 캠페인을 선택해주세요.");
      return;
    }
    if (!formData.name.trim()) {
      setErrorMsg("행사명을 입력해주세요.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    const res = await safeCall(createEventAction({
      campaignId: selectedCampaignId,
      name: formData.name.trim(),
      eventAtLocal: formData.event_at || null,
      venue: formData.venue.trim() || null,
      memo: formData.memo.trim() || null,
    }));
    setLoading(false);
    if (!res.ok) {
      setErrorMsg(res.error);
      return;
    }
    setOpen(false);
    router.push(`/campaigns/${selectedCampaignId}/events/${res.data.id}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setErrorMsg(null); setOpen(true); }}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold shadow-md transition active:scale-95 shrink-0"
      >
        <Plus className="w-4 h-4" />
        <span>새 행사 개설</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          style={{ animationTimingFunction: "var(--ease-out)" }}
        >
          <div
            className="w-full max-w-lg bg-surface border-t sm:border border-border rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto font-sans animate-in zoom-in-95 duration-200"
            style={{ animationTimingFunction: "var(--ease-out)" }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <PartyPopper className="w-5 h-5 text-teal-400" />
                <h2 className="text-base font-bold text-text">신규 인플루언서 행사 개설</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-text-sub hover:text-text transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{errorMsg}</div>
            )}

            {campaigns.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-text-sub leading-relaxed">행사를 개설하려면 먼저 연계할 마케팅 캠페인이 필요합니다.</p>
                <Link href="/campaigns/new" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition">
                  <Plus className="w-3.5 h-3.5" />
                  <span>새 캠페인 먼저 생성하기</span>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-2">연계 캠페인 선택 *</label>
                  <select
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-teal-500 font-medium"
                  >
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>[{c.company_name}] {c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-2">행사명 *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="예: 글로우랩 신제품 런칭 VIP 프라이빗 뷰티 나잇"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text-2">행사 일시 (한국 시간)</label>
                    <input
                      type="datetime-local"
                      value={formData.event_at}
                      onChange={(e) => setFormData({ ...formData, event_at: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text-2">행사 장소</label>
                    <input
                      type="text"
                      value={formData.venue}
                      onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                      placeholder="예: 서울 성동구 성수이로 88 보테가 성수 2F"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-2">행사 메모 / 기획 의도</label>
                  <textarea
                    rows={3}
                    value={formData.memo}
                    onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                    placeholder="예: 최상위 뷰티 크리에이터 30인 초청, 신제품 앰플 테이스팅 바 및 포토존 운영"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-teal-500 leading-relaxed"
                  />
                </div>

                <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-medium">
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>행사 개설하기</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
