import { notFound } from "next/navigation";
import { getSnsAccountByToken, getSnsContentsByAccountId } from "@/lib/db";
import { toPublicSnsAccount, toReviewableSnsContent } from "@/lib/db/types";
import SnsApprovalClient from "./SnsApprovalClient";
import { ShieldCheck } from "lucide-react";

export const revalidate = 0;

/**
 * 광고주 시안 승인 페이지 (공개, 토큰 접근).
 * - 승인대기(pending_approval) 콘텐츠만 보여준다.
 * - 내부 제작 메모, 성과 수치, 토큰 값은 응답 객체에 아예 포함하지 않는다.
 */
export default async function SnsApprovalPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const account = await getSnsAccountByToken("approval", token);
  if (!account) notFound();

  const contents = await getSnsContentsByAccountId(account.id);
  const pending = contents
    .filter((c) => c.status === "pending_approval")
    .sort((a, b) => (a.scheduled_on || "9999").localeCompare(b.scheduled_on || "9999"))
    .map(toReviewableSnsContent);

  return (
    <div className="min-h-screen bg-bg text-text p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="p-6 rounded-3xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xl">
          <div className="space-y-1">
            <span className="px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold">광고주 시안 컨펌</span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-text">{account.company_name} SNS 콘텐츠 시안 검토 및 승인</h1>
            <p className="text-xs text-text-sub">
              담당 에이전시에서 제작한 피드/릴스 시안을 확인하시고 [승인] 또는 [수정 요청]을 진행해주세요. 처리된 시안은 목록에서 사라집니다.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-sub bg-bg px-3 py-2 rounded-xl border border-border">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <span>전용 링크로 접속됨</span>
          </div>
        </div>

        <SnsApprovalClient token={token} account={toPublicSnsAccount(account)} initialContents={pending} />
      </div>
    </div>
  );
}
