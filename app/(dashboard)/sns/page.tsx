import { getSnsAccounts } from "@/lib/db";
import Link from "next/link";
import { Camera, Plus, ArrowRight } from "lucide-react";
import NewSnsAccountModal from "./NewSnsAccountModal";

export const revalidate = 0;

export default async function SnsAccountsListPage() {
  const accounts = await getSnsAccounts();

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <Camera className="w-6 h-6 text-sky-400" />
            <span>SNS 공식 채널 대행 운영</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            브랜드 공식 계정의 사전설문 자료수집, 운영안(PPT), 월간 콘텐츠 캘린더 및 광고주 시안 승인을 관리합니다.
          </p>
        </div>

        <NewSnsAccountModal />
      </div>

      {accounts.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-[#22242A] rounded-2xl bg-[#131418] space-y-3">
          <Camera className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-zinc-400 text-xs sm:text-sm">등록된 SNS 대행 계정이 없습니다.</p>
          <p className="text-zinc-500 text-xs">상단의 [새 계정 등록] 버튼을 눌러 인스타그램/유튜브 대행 계정을 등록하세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <Link
              key={acc.id}
              href={`/sns/${acc.id}`}
              className="group p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-sky-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 shadow-md active:scale-[0.99]"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold uppercase">
                    {acc.platform}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    acc.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                  }`}>
                    {acc.status === "active" ? "운영중" : "계약종료"}
                  </span>
                </div>

                <div>
                  <h2 className="text-base font-bold text-zinc-100 group-hover:text-sky-400 transition leading-snug">
                    {acc.company_name}
                  </h2>
                  <p className="text-xs text-sky-400/90 font-mono mt-0.5">
                    @{acc.handle}
                  </p>
                </div>

                <div className="text-[11px] text-zinc-500 font-mono">
                  계약: {acc.starts_on || "시작일 미정"} ~ {acc.ends_on || "종료일 미정"}
                </div>
              </div>

              <div className="pt-3 border-t border-[#22242A] flex items-center justify-between text-xs text-zinc-400">
                <span>계정 관리 허브</span>
                <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-sky-400 group-hover:translate-x-0.5 transition" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}