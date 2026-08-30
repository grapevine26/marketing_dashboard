import { createCampaign } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Building2, Truck, MapPin } from "lucide-react";

export default function NewCampaignPage() {
  async function action(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const company_name = formData.get("company_name") as string;
    const campaign_type = formData.get("campaign_type") as "shipping" | "visit";

    if (!name || !company_name || !campaign_type) {
      throw new Error("Missing required fields");
    }

    const campaign = await createCampaign({
      name,
      company_name,
      campaign_type,
    });

    redirect(`/campaigns/${campaign.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/campaigns"
        className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1 transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>캠페인 목록으로 돌아가기</span>
      </Link>

      <div className="p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-6 shadow-2xl">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-zinc-100">새 시딩 캠페인 생성</h1>
          <p className="text-xs text-zinc-400">
            캠페인을 생성하면 사전조사, 신청폼, 지원자 리스트, 시딩 관리시트의 고유 링크가 자동 발급됩니다.
          </p>
        </div>

        <form action={action} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">캠페인명 *</label>
            <input
              type="text"
              name="name"
              required
              placeholder="예: 글로우랩 하이드라 세럼 인플루언서 시딩"
              className="w-full px-4 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">광고주 / 브랜드명 *</label>
            <input
              type="text"
              name="company_name"
              required
              placeholder="예: 글로우랩 코스메틱"
              className="w-full px-4 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">캠페인 유형 *</label>
            <div className="grid grid-cols-2 gap-3">
              <label className="p-4 rounded-xl border border-[#22242A] bg-[#090A0C] hover:border-blue-500 cursor-pointer flex items-center gap-3 transition">
                <input
                  type="radio"
                  name="campaign_type"
                  value="shipping"
                  defaultChecked
                  className="accent-blue-600"
                />
                <div>
                  <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-400" />
                    <span>배송형 시딩</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">제품 택배 발송 및 후기 수집</div>
                </div>
              </label>

              <label className="p-4 rounded-xl border border-[#22242A] bg-[#090A0C] hover:border-blue-500 cursor-pointer flex items-center gap-3 transition">
                <input
                  type="radio"
                  name="campaign_type"
                  value="visit"
                  className="accent-blue-600"
                />
                <div>
                  <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                    <span>방문형 시딩</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">매장/팝업 방문 일정 조율</div>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition"
            >
              캠페인 생성하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}