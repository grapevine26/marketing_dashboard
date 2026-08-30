import { redirect } from "next/navigation";
import { createCampaign } from "@/lib/db";
import { Truck, MapPin } from "lucide-react";

export default function NewCampaignPage() {
  async function handleCreate(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const company_name = formData.get("company_name") as string;
    const campaign_type = (formData.get("campaign_type") || "shipping") as "shipping" | "visit";

    if (!name || !company_name) return;

    const campaign = await createCampaign({
      name,
      company_name,
      campaign_type,
    });

    redirect(`/campaigns/${campaign.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">새 캠페인 생성</h1>
        <p className="text-sm text-slate-400">
          새로운 인플루언서 시딩 캠페인을 생성하고 전용 공유 링크를 발급받습니다.
        </p>
      </div>

      <form action={handleCreate} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-200">
            캠페인 이름 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="name"
            required
            placeholder="예: 글로우랩 하이드라 세럼 인플루언서 시딩"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-200">
            광고주 / 브랜드명 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="company_name"
            required
            placeholder="예: 글로우랩 코스메틱"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-200">
            캠페인 유형 <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-950/60 cursor-pointer has-checked:border-blue-500 has-checked:bg-blue-500/10">
              <input
                type="radio"
                name="campaign_type"
                value="shipping"
                defaultChecked
                className="mt-1"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-white text-sm">
                  <Truck className="w-4 h-4 text-amber-400" />
                  <span>제품배송형</span>
                </div>
                <p className="text-xs text-slate-400">
                  인플루언서 주소로 제품을 배송하여 리뷰를 제작하는 캠페인입니다.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-950/60 cursor-pointer has-checked:border-blue-500 has-checked:bg-blue-500/10">
              <input
                type="radio"
                name="campaign_type"
                value="visit"
                className="mt-1"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-white text-sm">
                  <MapPin className="w-4 h-4 text-purple-400" />
                  <span>현장방문형</span>
                </div>
                <p className="text-xs text-slate-400">
                  매장/행사장에 방문 일정 및 인원을 예약하여 체험하는 캠페인입니다.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md transition"
          >
            캠페인 생성하기
          </button>
        </div>
      </form>
    </div>
  );
}
