import type { Metadata } from "next";
import Link from "next/link";
import { Link2Off } from "lucide-react";
import { peekSignupInvite } from "@/lib/auth/invites";
import SignupClient from "../SignupClient";

export const metadata: Metadata = {
  title: "가입 신청 | RB Global",
};

// 초대 링크는 쓰는 순간 죽는다. 캐시된 화면이 죽은 링크를 살아 있는 것처럼 보여주면 안 된다.
export const revalidate = 0;

/**
 * 초대 링크로 들어온 가입 화면.
 *
 * 여기서는 링크를 **확인만** 한다. 화면을 열어 본 것으로 링크가 죽으면, 새로고침 한 번에
 * 가입을 못 하게 된다. 실제로 소모하는 것은 계정이 만들어진 뒤다(app/login/actions.ts).
 */
export default async function SignupWithInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await peekSignupInvite(token);

  if (!invite) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-sm p-8 rounded-3xl bg-surface border border-border text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-surface2 border border-border flex items-center justify-center">
            <Link2Off className="w-6 h-6 text-text-sub" />
          </div>
          <h1 className="text-lg font-bold text-text">쓸 수 없는 초대 링크입니다</h1>
          <p className="text-sm text-text-sub leading-relaxed">
            이미 사용했거나 기한이 지났습니다. 초대 링크는 한 번만 쓸 수 있습니다. 관리자에게 새 링크를
            요청해주세요.
          </p>
          <Link
            href="/login"
            className="inline-block px-4 py-2 rounded-xl bg-surface2 border border-border text-xs font-bold text-text hover:bg-surface3 transition"
          >
            로그인 화면으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center py-8 px-3 sm:p-6 font-sans">
      <SignupClient inviteToken={invite.token} inviteLabel={invite.label} />
    </div>
  );
}
