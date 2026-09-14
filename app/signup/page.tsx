import type { Metadata } from "next";
import Link from "next/link";
import { MailQuestion } from "lucide-react";

export const metadata: Metadata = {
  title: "가입 안내 | RB Global",
};

/**
 * 초대 링크 없이 가입 주소로 들어온 경우.
 *
 * 전에는 여기가 곧 가입 폼이었다. 지금은 초대 링크로만 가입하므로 안내만 한다.
 * 주소를 아는 것만으로는 아무것도 할 수 없다는 것을 분명히 보여주는 화면이기도 하다.
 */
export default function SignupInfoPage() {
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm p-8 rounded-3xl bg-surface border border-border text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-surface2 border border-border flex items-center justify-center">
          <MailQuestion className="w-6 h-6 text-text-sub" />
        </div>
        <h1 className="text-lg font-bold text-text">초대 링크가 필요합니다</h1>
        <p className="text-sm text-text-sub leading-relaxed">
          가입은 관리자가 보낸 초대 링크로만 할 수 있습니다. 링크를 받지 못하셨다면 담당 관리자에게
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
