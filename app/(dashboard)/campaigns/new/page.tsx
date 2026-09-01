import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import NewCampaignClient from "./NewCampaignClient";

export default function NewCampaignPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 font-sans">
      <Link
        href="/campaigns"
        className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1 transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>캠페인 목록으로 돌아가기</span>
      </Link>

      <div className="p-6 sm:p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-6 shadow-2xl">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-zinc-100">새 시딩 캠페인 생성</h1>
          <p className="text-xs text-zinc-400">
            캠페인을 생성하면 사전조사, 신청폼, 지원자 리스트, 시딩 관리시트의 고유 링크가 자동 발급됩니다.
          </p>
        </div>

        <NewCampaignClient />
      </div>
    </div>
  );
}