/**
 * 등급과 상태의 정의.
 *
 * **서버 전용 코드를 넣지 마라.** 이 파일은 클라이언트 화면에서도 가져다 쓴다.
 * 세션을 읽는 코드(`session.ts`)는 `next/headers` 를 쓰므로 브라우저 번들에 들어갈 수 없다.
 * 등급 이름과 판별 같은 순수한 값만 여기 둔다.
 */

/**
 * 등급 셋. 위로 갈수록 넓다.
 * - owner  대표 관리자: 모든 것. 등급 변경과 대표 관리자에 대한 조치는 여기만 할 수 있다.
 * - admin  관리자: 대시보드 전체와 활동 기록, 그리고 직원에 대해서만 승인·차단·초기화·삭제.
 * - staff  직원: 대시보드만.
 */
export type UserRole = "owner" | "admin" | "staff";

export type UserStatus = "pending" | "active" | "blocked";

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "대표 관리자",
  admin: "관리자",
  staff: "직원",
};

/** 사용자 관리에 들어갈 수 있는 등급. 관리자는 직원만 다룰 수 있다. */
export function isManager(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * 활동 기록을 볼 수 있는 등급. 대표 관리자뿐이다.
 *
 * 기록에는 누가 언제 무엇을 했는지가 전부 남는다. 동료를 들여다보는 창이기도 해서
 * 관리자에게까지 열면 보는 사람이 늘어나는 만큼 기록의 의미가 옅어진다.
 * 그래서 사용자 관리보다 한 단계 좁게 잠갔다.
 */
export function isOwner(role: UserRole): boolean {
  return role === "owner";
}

/** 화면이 다루는 사용자 정보. 세션에서 읽어 오지만 모양 자체는 순수한 값이다. */
export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
}
