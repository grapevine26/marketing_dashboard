import Link from "next/link";
import { getCampaigns } from "@/lib/db";
import { Plus, Building2, Truck, MapPin, ArrowRight, Calendar } from "lucide-react";

export const revalidate = 0;

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">캠페인 목록</h1>
          <p className="text-sm text-slate-400">
            진행 중인 인플루언서 시딩 캠페인을 관리하고 단계별 현황을 확인합니다.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>새 캠페인 만들기</span>
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 space-y-3">
          <p className="text-slate-400">등록된 캠페인이 없습니다.</p>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-1.5 text-blue-400 hover:underline text-sm font-medium"
          >
            첫 캠페인을 생성해보세요 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {campaigns.map((camp) => (
            <Link
              key={camp.id}
              href={`/campaigns/${camp.id}`}
              className="group p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900 transition flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      camp.campaign_type === "shipping"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                    }`}
                  >
                    {camp.campaign_type === "shipping" ? (
                      <>
                        <Truck className="w-3 h-3" /> 제품배송형
                      </>
                    ) : (
                      <>
                        <MapPin className="w-3 h-3" /> 현장방문형
                      </>
                    )}
                  </span>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(camp.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-white group-hover:text-blue-400 transition leading-snug">
                    {camp.name}
                  </h2>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    {camp.company_name}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>진행 허브 관리하기</span>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-400 group-hover:translate-x-0.5 transition" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
