import { notFound } from "next/navigation";
import { getSnsAccountByToken, getSnsIntakeTemplate, getSnsIntakeResponse } from "@/lib/db";
import SnsIntakeFormClient from "./SnsIntakeFormClient";
import { Camera, ShieldCheck, Sparkles, Video, Play, MessageCircle } from "lucide-react";

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

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "instagram":
        return <Camera className="w-6 h-6 text-pink-500" />;
      case "youtube":
        return <Play className="w-6 h-6 text-red-500" />;
      case "tiktok":
        return <Video className="w-6 h-6 text-cyan-400" />;
      case "blog":
        return <MessageCircle className="w-6 h-6 text-emerald-400" />;
      default:
        return <Camera className="w-6 h-6 text-sky-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100 flex flex-col items-center justify-center p-4 sm:p-6 md:p-10 font-sans">
      <div className="w-full max-w-2xl bg-[#131418] border border-[#22242A] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        {/* Header Branding */}
        <div className="text-center space-y-3 pb-5 border-b border-[#22242A]">
          <div className="w-14 h-14 rounded-2xl bg-[#090A0C] border border-[#22242A] flex items-center justify-center mx-auto shadow-inner">
            {getPlatformIcon(account.platform)}
          </div>
          
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3 h-3" />
            <span>{account.platform} 공식 채널 운영 대행</span>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">
              {account.company_name} SNS 사전설문
            </h1>
            <p className="text-xs font-mono text-zinc-400">
              @{account.handle}
            </p>
          </div>

          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-lg mx-auto">
            공식 채널 운영 및 맞춤형 콘텐츠 기획을 위해 브랜드 톤앤매너, 핵심 타겟, 필수 강조 포인트 등을 알려주세요.
          </p>
        </div>

        {/* Survey Form Client */}
        <SnsIntakeFormClient
          token={token}
          account={account}
          template={template}
          existingResponse={existingResponse}
        />

        {/* Footer Security Notice */}
        <div className="pt-4 border-t border-[#22242A] flex items-center justify-center gap-2 text-[11px] text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>광고주 전용 보안 링크로 안전하게 전송되며 언제든지 수정 제출이 가능합니다.</span>
        </div>
      </div>
    </div>
  );
}