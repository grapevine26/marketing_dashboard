"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction } from "./actions";
import { Truck, MapPin, Loader2, Sparkles } from "lucide-react";

export default function NewCampaignClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [campaignType, setCampaignType] = useState<"shipping" | "visit">("shipping");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !companyName.trim()) {
      setErrorMsg("캠페인명과 브랜드명을 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await createCampaignAction({
        name: name.trim(),
        company_name: companyName.trim(),
        campaign_type: campaignType,
      });

      if (res.success && res.campaign) {
        router.push(`/campaigns/${res.campaign.id}`);
      }
    } catch (err: any) {
      console.error("Campaign Creation Error:", err);
      setErrorMsg(err.message || "캠페인 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 font-sans">
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-300">캠페인명 *</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 글로우랩 하이드라 세럼 인플루언서 시딩"
          className="w-full px-4 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-300">광고주 / 브랜드명 *</label>
        <input
          type="text"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="예: 글로우랩 코스메틱"
          className="w-full px-4 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-300">캠페인 유형 *</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label
            onClick={() => setCampaignType("shipping")}
            className={`p-4 rounded-2xl border cursor-pointer flex items-center gap-3 transition ${
              campaignType === "shipping"
                ? "bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-md"
                : "bg-[#090A0C] border-[#22242A] hover:border-zinc-700 text-zinc-400"
            }`}
          >
            <input
              type="radio"
              name="campaign_type"
              value="shipping"
              checked={campaignType === "shipping"}
              onChange={() => setCampaignType("shipping")}
              className="accent-blue-600"
            />
            <div>
              <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-blue-400" />
                <span>배송형 시딩</span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5">제품 택배 발송 및 후기 수집</div>
            </div>
          </label>

          <label
            onClick={() => setCampaignType("visit")}
            className={`p-4 rounded-2xl border cursor-pointer flex items-center gap-3 transition ${
              campaignType === "visit"
                ? "bg-indigo-600/10 border-indigo-500/50 text-indigo-400 shadow-md"
                : "bg-[#090A0C] border-[#22242A] hover:border-zinc-700 text-zinc-400"
            }`}
          >
            <input
              type="radio"
              name="campaign_type"
              value="visit"
              checked={campaignType === "visit"}
              onChange={() => setCampaignType("visit")}
              className="accent-indigo-600"
            />
            <div>
              <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-indigo-400" />
                <span>방문형 시딩</span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5">매장/팝업 방문 일정 조율 및 행사 연계</div>
            </div>
          </label>
        </div>
      </div>

      <div className="pt-3 flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>캠페인 생성 중...</span>
            </>
          ) : (
            <span>캠페인 생성하기</span>
          )}
        </button>
      </div>
    </form>
  );
}