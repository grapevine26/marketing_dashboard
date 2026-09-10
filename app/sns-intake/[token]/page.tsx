import { notFound } from "next/navigation";
import { getSnsAccountByToken, getSnsIntakeQuestionsForAccount, getSnsIntakeResponse } from "@/lib/db";
import { toPublicSnsAccount } from "@/lib/db/types";
import SnsIntakeFormClient from "./SnsIntakeFormClient";
import { Camera, ShieldCheck, Sparkles, Video, Play } from "lucide-react";

export const revalidate = 0;

export default async function SnsIntakePublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const account = await getSnsAccountByToken("intake", token);
  if (!account) notFound();

  const [questions, existingResponse] = await Promise.all([
    getSnsIntakeQuestionsForAccount(account.id),
    getSnsIntakeResponse(account.id),
  ]);

  const template = { id: 1, questions };

  const icon =
    account.platform === "youtube" ? <Play className="w-6 h-6 text-red-500" />
    : account.platform === "tiktok" ? <Video className="w-6 h-6 text-cyan-400" />
    : account.platform === "instagram" ? <Camera className="w-6 h-6 text-pink-500" />
    : <Camera className="w-6 h-6 text-accent2" />;

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center py-6 px-3 sm:p-6 md:p-10 font-sans">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-3 pb-5 border-b border-border">
          <div className="w-14 h-14 rounded-2xl bg-bg border border-border flex items-center justify-center mx-auto shadow-inner">{icon}</div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent2/10 border border-accent2/20 text-accent2 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3 h-3" />
            <span>{account.platform} 공식 채널 운영 대행</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight">{account.company_name} SNS 사전설문</h1>
            <p className="text-xs font-mono text-text-sub">@{account.handle}</p>
          </div>
          <p className="text-xs sm:text-sm text-text-sub leading-relaxed max-w-lg mx-auto">
            공식 채널 운영 및 맞춤형 콘텐츠 기획을 위해 브랜드 톤앤매너, 핵심 타겟, 필수 강조 포인트 등을 알려주세요.
          </p>
        </div>

        <SnsIntakeFormClient
          token={token}
          account={toPublicSnsAccount(account)}
          template={template}
          initialAnswers={existingResponse?.answers || null}
        />

        <div className="pt-4 border-t border-border flex items-center justify-center gap-2 text-[11px] text-text-muted">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>광고주 전용 링크로 전송되며 언제든지 수정 제출이 가능합니다.</span>
        </div>
      </div>
    </div>
  );
}
