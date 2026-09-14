import { requireUser } from "@/lib/auth/session";
import { countPendingUsers } from "@/lib/auth/users";
import DashboardShell from "./DashboardShell";

/**
 * 대시보드 전체를 덮는 인증 관문.
 *
 * 서버 컴포넌트여야 한다. 클라이언트에서 하는 검사는 화면을 가릴 뿐 데이터를 막지 못한다.
 * 여기를 통과하지 못하면 `requireUser` 가 로그인·대기·차단 화면으로 보낸다.
 *
 * 다만 이 관문만으로는 부족하다. 서버 액션은 화면을 거치지 않고 직접 호출될 수 있어서,
 * 각 액션도 `runAuthedAction` 으로 따로 막는다.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // 대기자 수는 승인할 수 있는 사람에게만 의미가 있다. 관리자가 아니면 조회 자체를 하지 않는다.
  const pendingCount = user.role === "admin" ? await countPendingUsers() : 0;

  return (
    <DashboardShell user={user} pendingCount={pendingCount}>
      {children}
    </DashboardShell>
  );
}
