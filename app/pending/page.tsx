import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "../login/LoginClient";

export const metadata: Metadata = {
  title: "승인 대기 | MOA",
};

/**
 * 승인 대기 화면.
 *
 * 로그인은 했지만 아직 관리자가 승인하지 않은 사람이 보는 곳이다.
 * 상태가 바뀌었는데도 이 화면이 남아 있으면 이상하므로, 들어올 때마다 다시 확인해서
 * 알맞은 곳으로 보낸다. (승인된 뒤 이 주소를 즐겨찾기로 다시 열 수 있다.)
 */
export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "active") redirect("/");
  if (user.status === "blocked") redirect("/blocked");

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center py-8 px-3 sm:p-6 font-sans">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl sm:rounded-3xl p-5 sm:p-8 space-y-5 text-center shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/20 text-warn flex items-center justify-center mx-auto">
          <Clock className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight">
            관리자 승인 대기 중입니다
          </h1>
          <p className="text-xs text-text-sub leading-relaxed">
            가입 신청이 접수되었습니다. 관리자가 승인하면 바로 이용할 수 있습니다.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-bg border border-border text-xs space-y-1.5 text-left">
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-muted">아이디</span>
            <span className="font-mono font-bold text-text-2 break-all">{user.username}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-muted">이름</span>
            <span className="font-bold text-text-2 break-all">{user.display_name}</span>
          </div>
        </div>

        <LogoutButton />
      </div>
    </div>
  );
}
