import { getCampaigns } from "@/lib/db";
import Link from "next/link";
import { Plus, ArrowRight, Truck, Building2, FolderKanban } from "lucide-react";

export const revalidate = 0;

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-blue-400" />
            <span>A. 인플루언서 시딩 캠페인</span>
          </h1>
          <p className="text-sm text-zinc-400">
            사전조사부터 신청폼, 인플루언서 선정, 배송/방문 관리시트 및 결과보고서까지 원스톱으로 관리합니다.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>새 캠페인 등록</span>
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-[#22242A] rounded-2xl bg-[#131418] space-y-3">
          <p className="text-zinc-400">등록된 캠페인이 없습니다.</p>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:underline font-semibold"
          >
            <span>첫 번째 캠페인 만들기</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {campaigns.map((camp) => (
            <Link
              key={camp.id}
              href={`/campaigns/${camp.id}`}
              className="group p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
                    {camp.campaign_type === "shipping" ? "배송형" : "방문형"}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">
                    {new Date(camp.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div>
                  <h2 className="text-base font-bold text-zinc-100 group-hover:text-blue-400 transition leading-snug">
                    {camp.name}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{camp.company_name}</span>
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[#22242A] flex items-center justify-between text-xs text-zinc-400">
                <span>상태: <strong className="text-blue-400 font-semibold">{camp.status}</strong></span>
                <span className="flex items-center gap-1 group-hover:text-blue-400 font-semibold transition">
                  관리 허브 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}