import "server-only";
import { redirect } from "next/navigation";
import { db, unwrapMaybe } from "../db/client";
import { createAuthClient } from "../supabase/auth";

/**
 * 현재 로그인한 사용자를 알아낸다.
 *
 * 두 겹으로 막는 구조의 안쪽이다. 바깥쪽(proxy.ts)은 쿠키가 있는지만 빠르게 보고,
 * 실제로 쓸 수 있는 계정인지는 여기서 DB 를 보고 판정한다.
 * Next.js 문서가 권하는 방식이다: 프록시는 낙관적 검사, 데이터에 닿는 곳에서 진짜 검사.
 */

// 등급 정의는 클라이언트에서도 쓰므로 서버 전용이 아닌 파일에 둔다. 여기서는 다시 내보내기만 한다.
export { ROLE_LABELS, isManager, type UserRole, type UserStatus, type SessionUser } from "./roles";
import { isManager, type UserRole, type UserStatus, type SessionUser } from "./roles";



interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
}

/**
 * 로그인한 사용자의 프로필. 로그인하지 않았거나 프로필이 없으면 null.
 * 상태(pending/blocked)는 걸러내지 않는다. 대기 화면도 자기 정보를 보여줘야 하기 때문이다.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  let authUserId: string;
  try {
    const supabase = await createAuthClient();
    // getUser 는 토큰을 서버에서 검증한다. getSession 은 쿠키를 그대로 믿으므로 쓰지 않는다.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    authUserId = data.user.id;
  } catch {
    // 환경 변수가 없거나 인증 서버에 닿지 못한 경우. 로그인하지 않은 것으로 본다.
    return null;
  }

  const row = unwrapMaybe(
    await db()
      .from("profiles")
      .select("id, username, display_name, role, status")
      .eq("id", authUserId)
      .maybeSingle<ProfileRow>()
  );
  return row ?? null;
}

/**
 * 쓸 수 있는 계정만 통과시킨다. 아니면 알맞은 화면으로 보낸다.
 * 대시보드 레이아웃과 모든 대시보드 서버 액션이 이걸 거친다.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "pending") redirect("/pending");
  if (user.status === "blocked") redirect("/blocked");
  return user;
}

/** 관리 화면에 들어갈 수 있는 사람만 통과시킨다(대표 관리자·관리자). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isManager(user.role)) redirect("/");
  return user;
}

/** 대표 관리자만 통과시킨다. 등급 변경처럼 가장 무거운 일에 쓴다. */
export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/");
  return user;
}

/**
 * 활성 대표 관리자 수. 마지막 한 명을 잃지 않도록 확인하는 데 쓴다.
 * 대표가 0명이 되면 아무도 등급을 바꿀 수 없어 앱이 잠긴다.
 */
export async function countActiveOwners(): Promise<number> {
  const { count, error } = await db()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("status", "active");
  if (error) throw new Error(`[auth] ${error.message}`);
  return count ?? 0;
}
