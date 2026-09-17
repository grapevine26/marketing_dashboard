import { requireUser, isManager } from "@/lib/auth/session";
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
  //
  // 실패를 삼키는 이유: 여기는 레이아웃이라 예외가 올라가면 **대시보드 전 화면**이
  // "문제가 생겼습니다" 로 바뀐다. 사이드바 배지 하나 때문에 캠페인도 행사도 SNS 도
  // 못 보게 되는 것은 남는 장사가 아니다.
  //
  // 대신 0 을 "대기자가 없다" 는 뜻으로 쓰지 않는다. DashboardShell 은 0이면 배지도 빨간 점도
  // 그리지 않으므로, 여기서 0 은 곧 **배지를 감춘다**는 뜻이다. 실패해 놓고 "0명" 이라고
  // 적어 보여주면 거짓말이 되지만, 아무 말도 하지 않으면 거짓말은 아니다.
  const pendingCount = isManager(user.role)
    ? await countPendingUsers().catch((err) => {
        console.error("[layout] 승인 대기자 수 조회 실패(배지를 감춘다):", err);
        return 0;
      })
    : 0;

  return (
    <DashboardShell user={user} pendingCount={pendingCount}>
      {children}
    </DashboardShell>
  );
}
