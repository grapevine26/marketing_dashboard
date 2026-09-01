import { notFound } from "next/navigation";
import { getSnsAccountByToken, getSnsIntakeTemplate, getSnsIntakeResponse } from "@/lib/db";
import SnsIntakeFormClient from "./SnsIntakeFormClient";
import { Camera, ShieldCheck } from "lucide-react";

export const revalidate = 0;

export default async function SnsIntakePublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const account = await getSnsAccountByToken("intake", token);
  if (!account) notFound();

  const [template, existingResponse] = await Promise.all([
    getSnsIntakeTemplate(),
    getSnsIntakeResponse(account.id),
  ]);

  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-2xl bg-[#131418] border border-[#22242A] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-2 pb-4 border-b border-[#22242A]">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto mb-3">
            <Camera className="w-6 h-6" />
          </div>
          <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 text-xs font-semibold">
            {account.platform.toUpperCase()} 공식 채널 대행
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">
            {account.company_name} SNS 운영 사전설문
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            성공적인 채널 운영 및 콘텐츠 기획을 위해 브랜드 톤앤매너와 가이드라인을 작성해주세요.
          </p>
        </div>

        <SnsIntakeFormClient
          token={token}
          account={account}
          template={template}
          existingResponse={existingResponse}
        />

        <div className="pt-4 border-t border-[#22242A] flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
          <span>안전한 전용 보안 토큰을 통해 전송됩니다.</span>
        </div>
      </div>
    </div>
  );
}