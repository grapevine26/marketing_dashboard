import { notFound } from "next/navigation";
import { getSnsAccountByToken, getSnsContentsByAccountId } from "@/lib/db";
import SnsApprovalClient from "./SnsApprovalClient";
import { Camera, ShieldCheck } from "lucide-react";

export const revalidate = 0;

export default async function SnsApprovalPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const account = await getSnsAccountByToken("approval", token);
  if (!account) notFound();

  const contents = await getSnsContentsByAccountId(account.id);
  const reviewableContents = contents.filter(
    (c) => c.status === "pending_approval" || c.status === "approved" || c.status === "producing"
  );

  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xl">
          <div className="space-y-1">
            <span className="px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold">
              광고주 시안 컨펌 허브
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-100">
              {account.company_name} SNS 콘텐츠 시안 검토 및 승인
            </h1>
            <p className="text-xs text-zinc-400">
              담당 에이전시에서 제작한 피드/릴스 시안을 확인하시고 [승인] 또는 [수정 요청]을 진행해주세요.
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-[#090A0C] px-3 py-2 rounded-xl border border-[#22242A]">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <span>보안 인증 확인됨</span>
          </div>
        </div>

        <SnsApprovalClient account={account} initialContents={reviewableContents} />
      </div>
    </div>
  );
}