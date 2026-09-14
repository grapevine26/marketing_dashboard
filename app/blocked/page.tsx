import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Ban } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "../login/LoginClient";

export const metadata: Metadata = {
  title: "이용 중지 | RB Global",
};

/**
 * 차단 화면.
 *
 * 차단이 풀렸는데 이 화면에 머무르는 일이 없도록, 들어올 때마다 상태를 다시 보고
 * 알맞은 곳으로 보낸다.
 */
export default async function BlockedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "active") redirect("/");
  if (user.status === "pending") redirect("/pending");

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center py-8 px-3 sm:p-6 font-sans">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl sm:rounded-3xl p-5 sm:p-8 space-y-5 text-center shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <Ban className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight">
            이용이 중지되었습니다
          </h1>
          <p className="text-xs text-text-sub leading-relaxed">
            이 계정은 현재 사용할 수 없습니다. 관리자에게 문의하세요.
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
