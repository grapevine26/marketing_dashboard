import "server-only";
import { db, unwrap, unwrapMaybe } from "../db/client";
import { insertAuditLog } from "../db/audit";
import { ValidationError, isUuid, nowIso } from "../db/validation";
import { countActiveOwners, ROLE_LABELS, type SessionUser, type UserRole, type UserStatus } from "./session";
import { normalizeUsername, usernameToEmail, validateDisplayName, validatePassword } from "./username";
import { getAdminClient } from "../supabase/admin";

/**
 * 사용자 관리. 관리자만 부른다.
 *
 * 계정 자체(비밀번호·삭제)는 Supabase Auth 쪽에 있으므로 `auth.admin.*` 로 다루고,
 * 승인 상태와 역할은 profiles 테이블에서 다룬다.
 *
 * 모든 동작은 감사 로그에 남긴다. 누가 누구에게 권한을 줬는지는 나중에 반드시 필요해진다.
 */

export interface ManagedUser {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  approved_at: string | null;
  approved_by_name: string | null;
}

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

function rowToUser(r: ProfileRow, names: Map<string, string>): ManagedUser {
  return {
    id: r.id,
    username: r.username,
    display_name: r.display_name,
    role: r.role,
    status: r.status,
    created_at: new Date(r.created_at).toISOString(),
    approved_at: r.approved_at ? new Date(r.approved_at).toISOString() : null,
    approved_by_name: r.approved_by ? names.get(r.approved_by) ?? null : null,
  };
}

/** 전체 사용자. 대기중인 사람이 먼저 보이도록 정렬한다. */
export async function getUsers(): Promise<ManagedUser[]> {
  const rows = unwrap(
    await db()
      .from("profiles")
      .select("id, username, display_name, role, status, created_at, approved_at, approved_by")
      .order("created_at", { ascending: true })
      .returns<ProfileRow[]>()
  );
  const names = new Map(rows.map((r) => [r.id, r.display_name]));
  const order: Record<UserStatus, number> = { pending: 0, active: 1, blocked: 2 };
  return rows
    .map((r) => rowToUser(r, names))
    .sort((a, b) => order[a.status] - order[b.status] || a.created_at.localeCompare(b.created_at));
}

export async function countPendingUsers(): Promise<number> {
  const { count, error } = await db()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw new Error(`[auth] ${error.message}`);
  return count ?? 0;
}

async function readProfile(userId: string): Promise<ProfileRow> {
  if (!isUuid(userId)) throw new ValidationError("사용자를 찾을 수 없습니다.");
  const row = unwrapMaybe(
    await db()
      .from("profiles")
      .select("id, username, display_name, role, status, created_at, approved_at, approved_by")
      .eq("id", userId)
      .maybeSingle<ProfileRow>()
  );
  if (!row) throw new ValidationError("사용자를 찾을 수 없습니다.");
  return row;
}

async function logUserAction(actor: SessionUser, target: ProfileRow, action: string, summary: string) {
  await insertAuditLog({
    entity_type: "user",
    entity_id: target.id,
    action,
    actor_type: "agency",
    actor_name: actor.display_name,
    summary,
    details: { target_username: target.username, actor_username: actor.username },
  });
}

/**
 * 마지막 활성 대표 관리자를 잃는 동작을 막는다.
 * 대표가 0명이 되면 아무도 등급을 바꿀 수 없어 앱이 잠긴다.
 */
async function guardLastOwner(target: ProfileRow, what: string): Promise<void> {
  if (target.role !== "owner" || target.status !== "active") return;
  if ((await countActiveOwners()) <= 1) {
    throw new ValidationError(`마지막 대표 관리자는 ${what} 수 없습니다. 다른 대표 관리자를 먼저 지정하세요.`);
  }
}

function guardSelf(actor: SessionUser, target: ProfileRow, what: string): void {
  if (actor.id === target.id) {
    throw new ValidationError(`자기 자신을 ${what} 수 없습니다.`);
  }
}

/**
 * 관리자는 직원만 관리한다.
 *
 * 관리자끼리 서로를 차단·삭제할 수 있으면 다툼이 생겼을 때 서로 지워버릴 수 있다.
 * 대표 관리자를 건드리는 것은 더 말할 것도 없다. 그래서 대상이 직원이 아니면 대표만 통과시킨다.
 */
function guardTargetRank(actor: SessionUser, target: ProfileRow, what: string): void {
  if (actor.role === "owner") return;
  if (target.role === "staff") return;
  throw new ValidationError(
    `${ROLE_LABELS[target.role]} 계정은 대표 관리자만 ${what} 수 있습니다.`
  );
}

export async function approveUser(actor: SessionUser, userId: string): Promise<void> {
  const target = await readProfile(userId);
  guardTargetRank(actor, target, "승인할");
  if (target.status === "active") return;
  unwrap(
    await db()
      .from("profiles")
      .update({ status: "active", approved_at: nowIso(), approved_by: actor.id })
      .eq("id", userId)
      .select("id")
  );
  await logUserAction(actor, target, "user.approved", `${actor.display_name}가 ${target.display_name}(${target.username}) 계정을 승인했습니다.`);
}

export async function blockUser(actor: SessionUser, userId: string): Promise<void> {
  const target = await readProfile(userId);
  guardSelf(actor, target, "차단할");
  guardTargetRank(actor, target, "차단할");
  await guardLastOwner(target, "차단할");
  if (target.status === "blocked") return;
  unwrap(await db().from("profiles").update({ status: "blocked" }).eq("id", userId).select("id"));
  await logUserAction(actor, target, "user.blocked", `${actor.display_name}가 ${target.display_name}(${target.username}) 계정을 차단했습니다.`);
}

export async function unblockUser(actor: SessionUser, userId: string): Promise<void> {
  const target = await readProfile(userId);
  guardTargetRank(actor, target, "차단 해제할");
  if (target.status === "active") return;
  unwrap(
    await db()
      .from("profiles")
      .update({ status: "active", approved_at: target.approved_at ?? nowIso(), approved_by: target.approved_by ?? actor.id })
      .eq("id", userId)
      .select("id")
  );
  await logUserAction(actor, target, "user.unblocked", `${actor.display_name}가 ${target.display_name}(${target.username}) 계정의 차단을 해제했습니다.`);
}

/**
 * 등급 변경. **대표 관리자만 할 수 있다.**
 *
 * 관리자가 등급을 바꿀 수 있으면 스스로를 대표로 올리거나 다른 관리자를 내릴 수 있어
 * 등급 체계가 의미를 잃는다. 그래서 여기만 대표로 좁힌다.
 */
export async function setUserRole(actor: SessionUser, userId: string, role: UserRole): Promise<void> {
  if (role !== "owner" && role !== "admin" && role !== "staff") {
    throw new ValidationError("역할 값이 올바르지 않습니다.");
  }
  if (actor.role !== "owner") {
    throw new ValidationError("등급 변경은 대표 관리자만 할 수 있습니다.");
  }
  const target = await readProfile(userId);
  if (target.role === role) return;

  // 등급이 내려가는 경우에만 지킬 것이 있다. 올리는 것은 언제든 된다.
  const goingDown =
    (target.role === "owner" && role !== "owner") || (target.role === "admin" && role === "staff");
  if (goingDown) {
    guardSelf(actor, target, "강등할");
    await guardLastOwner(target, "강등할");
  }

  unwrap(await db().from("profiles").update({ role }).eq("id", userId).select("id"));
  await logUserAction(
    actor,
    target,
    "user.role_changed",
    `${actor.display_name}가 ${target.display_name}(${target.username})의 등급을 ` +
      `[${ROLE_LABELS[target.role]}]에서 [${ROLE_LABELS[role]}](으)로 바꿨습니다.`
  );
}

/**
 * 비밀번호 초기화. 이메일이 없어 본인이 스스로 찾을 길이 없으므로 관리자가 임시값을 정해준다.
 * 임시 비밀번호는 화면에 한 번만 보여주고 저장하지 않는다.
 */
export async function resetUserPassword(actor: SessionUser, userId: string, newPassword: string): Promise<void> {
  const target = await readProfile(userId);
  guardTargetRank(actor, target, "비밀번호를 초기화할");
  const password = validatePassword(newPassword);
  const { error } = await getAdminClient().auth.admin.updateUserById(target.id, { password });
  if (error) throw new Error(`[auth] 비밀번호 변경 실패: ${error.message}`);
  await logUserAction(actor, target, "user.password_reset", `${actor.display_name}가 ${target.display_name}(${target.username})의 비밀번호를 초기화했습니다.`);
}

/** 계정 삭제. auth.users 를 지우면 profiles 는 cascade 로 함께 사라진다. */
export async function deleteUser(actor: SessionUser, userId: string): Promise<void> {
  const target = await readProfile(userId);
  guardSelf(actor, target, "삭제할");
  guardTargetRank(actor, target, "삭제할");
  await guardLastOwner(target, "삭제할");
  // 지우기 전에 기록한다. 감사 로그는 대상이 사라져도 남아야 한다.
  await logUserAction(actor, target, "user.deleted", `${actor.display_name}가 ${target.display_name}(${target.username}) 계정을 삭제했습니다.`);
  const { error } = await getAdminClient().auth.admin.deleteUser(target.id);
  if (error) throw new Error(`[auth] 계정 삭제 실패: ${error.message}`);
}

/**
 * 가입. 아이디를 내부용 이메일로 바꿔 Supabase 에 만든다.
 * 프로필 행은 DB 트리거가 만든다(가입과 프로필이 어긋나는 순간을 없애려고).
 */
export async function signUpUser(input: {
  username: unknown;
  display_name: unknown;
  password: unknown;
}): Promise<{ username: string }> {
  const username = normalizeUsername(input.username);
  const displayName = validateDisplayName(input.display_name);
  const password = validatePassword(input.password);

  const { error } = await getAdminClient().auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true, // 실제 메일함이 없으므로 확인 절차를 건너뛴다
    user_metadata: { username, display_name: displayName },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      throw new ValidationError("이미 쓰이고 있는 아이디입니다.");
    }
    throw new Error(`[auth] 가입 실패: ${error.message}`);
  }
  return { username };
}
