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

/** 차단이 풀릴 때까지의 시간. 사실상 무기한이고, 차단 해제가 "none" 으로 되돌린다. */
const BAN_FOREVER = "876000h";

/**
 * 인증 쪽 계정을 잠그거나 푼다. **성공했으면 true.**
 *
 * profiles.status 만 바꾸면 이미 로그인한 브라우저의 세션은 그대로 살아 있다.
 * 우리 화면은 요청마다 status 를 보므로 막히지만, 세션 자체를 끊어 두는 편이 한 겹 더 안전하다.
 * 잠가 두면 인증 서버가 로그인과 토큰 갱신을 모두 거부한다.
 *
 * **예외는 올리지 않는다.** 차단 방향에서 여기가 예외를 던지면 인증 서버가 잠깐 흔들릴 때
 * 관리자가 차단조차 못 하게 된다. 진짜 방어선은 profiles.status 이고 그건 이미 바뀌었다.
 *
 * 다만 **해제 방향에서는 이야기가 뒤집힌다.** 여기가 실패하면 당사자는 상태가 active 인데도
 * 로그인을 못 한다. 그래서 삼키기만 하지 않고 성공 여부를 돌려준다. 판단은 호출부가 한다.
 */
async function setAuthBan(userId: string, banned: boolean): Promise<boolean> {
  const { error } = await getAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: banned ? BAN_FOREVER : "none",
  });
  if (error) {
    console.error(`[auth] 계정 ${banned ? "잠금" : "잠금 해제"} 실패 (${userId}): ${error.message}`);
    return false;
  }
  return true;
}

/**
 * 차단 해제가 반쪽만 성공했을 때 관리자에게 보여줄 문구.
 *
 * "실패했습니다" 로만 적으면 아무것도 안 바뀐 줄 알고 포기한다. 실제로는 절반은 바뀌었고,
 * 남은 절반은 **같은 버튼을 한 번 더 누르면** 복구된다. 그 사실을 문구에 그대로 담는다.
 */
export const UNBLOCK_AUTH_FAILED_MESSAGE =
  "상태는 활성으로 바꿨지만 로그인 잠금 해제에 실패했습니다. [차단 해제]를 한 번 더 눌러주세요. " +
  "화면을 새로고침해 그 버튼이 사라졌다면, 다시 [차단]한 뒤 [차단 해제]하면 복구됩니다.";

/**
 * 이미 active 인 계정을 다시 해제할 때(재시도)의 문구. 상태는 이번에 바꾼 것이 아니다.
 *
 * 뒷문장이 중요하다 — [차단 해제] 버튼은 행이 `blocked` 일 때만 보인다. 실패 뒤 새로고침하면
 * 행이 활성으로 보여 버튼이 사라지고, 그때는 차단부터 다시 하는 길밖에 없다. 그 사실을 적어 둔다.
 */
export const UNBLOCK_RETRY_AUTH_FAILED_MESSAGE =
  "계정 상태는 활성이지만 로그인 잠금 해제에 실패했습니다. 잠시 후 [차단 해제]를 한 번 더 눌러주세요. " +
  "버튼이 보이지 않으면 다시 [차단]한 뒤 [차단 해제]하면 복구됩니다.";

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
  hidden?: boolean;
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

/**
 * 목록에 보여줄 사용자. **숨긴 계정은 아예 빠진다.**
 *
 * 숨김은 개발자가 점검용으로 쓰는 계정을 위한 것이다. 고객이 보는 목록에 섞이면 혼란스럽다.
 * 개수 표시조차 남기지 않는 것은 서비스 소유자의 결정이다. 그래서 이 계정들은 화면 어디에도
 * 드러나지 않는다. 존재를 확인하려면 `npm run db:hide-user -- --list` 를 쓴다.
 */
export async function getUsers(): Promise<ManagedUser[]> {
  const rows = unwrap(
    await db()
      .from("profiles")
      .select("id, username, display_name, role, status, created_at, approved_at, approved_by, hidden")
      .order("created_at", { ascending: true })
      .returns<ProfileRow[]>()
  );
  // 승인자 이름은 숨긴 계정이 승인했을 수도 있으므로 전체에서 찾는다.
  const names = new Map(rows.map((r) => [r.id, r.display_name]));
  const order: Record<UserStatus, number> = { pending: 0, active: 1, blocked: 2 };
  return rows
    .filter((r) => !r.hidden)
    .map((r) => rowToUser(r, names))
    .sort((a, b) => order[a.status] - order[b.status] || a.created_at.localeCompare(b.created_at));
}

export async function countPendingUsers(): Promise<number> {
  const { count, error } = await db()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("hidden", false);
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
  // 남아 있던 로그인 세션도 끊는다. 상태만 바꾸면 갖고 있던 쿠키가 계속 살아 있다.
  //
  // 여기서는 결과를 **일부러 무시한다.** 이유는 setAuthBan 주석에 적힌 대로다.
  // 다만 남은 문제가 하나 있다: 잠금이 실패해도 화면에는 "차단됨" 만 뜨므로 관리자는
  // 남의 브라우저 세션까지 끊겼다고 잘못 믿는다(실제로는 그 쿠키가 살아 있다).
  // 우리 화면은 요청마다 profiles.status 를 보므로 그 세션으로 할 수 있는 일은 없지만,
  // "세션까지 끊었다" 는 보장은 아니다. 굳이 확실히 하려면 [차단 해제] 후 다시 [차단] 하면 된다.
  await setAuthBan(userId, true);
  await logUserAction(actor, target, "user.blocked", `${actor.display_name}가 ${target.display_name}(${target.username}) 계정을 차단했습니다.`);
}

/**
 * 차단 해제. **몇 번이고 다시 부를 수 있어야 한다.**
 *
 * 해제는 두 곳을 건드린다: profiles.status 와 인증 쪽 잠금. 뒤쪽이 실패하면 상태는 active 인데
 * 당사자는 계속 로그인을 못 한다. 로그인 화면은 잠김과 오타를 같은 문구로 돌려주므로
 * (app/login/actions.ts 의 CREDENTIAL_ERROR) 당사자도 관리자도 단서를 얻지 못한다.
 *
 * 전에는 여기 맨 앞에 `if (target.status === "active") return;` 이 있어서, 그 상태가 되면
 * [차단 해제]를 다시 눌러도 잠금 해제를 **재시도조차 하지 않았다.** 성공 토스트만 다시 떴다.
 * 화면에서 빠져나올 방법이 없어지는 것이다.
 *
 * 그래서 이미 active 여도 `setAuthBan(userId, false)` 는 반드시 부른다. `ban_duration: "none"`
 * 은 멱등이라 여러 번 불러도 안전하다. 대신 DB 쓰기와 감사 로그는 건너뛴다 — 같은 버튼을
 * 여러 번 눌렀다고 로그가 같은 줄로 채워지면 정작 봐야 할 기록이 묻힌다.
 */
export async function unblockUser(actor: SessionUser, userId: string): Promise<void> {
  const target = await readProfile(userId);
  guardTargetRank(actor, target, "차단 해제할");

  // 이미 active. 반쪽만 성공한 뒤의 재시도이거나, 그냥 두 번 누른 것이다.
  // 어느 쪽인지 알 수 없으므로 값싸고 멱등한 잠금 해제만 다시 시도한다.
  if (target.status === "active") {
    if (!(await setAuthBan(userId, false))) throw new ValidationError(UNBLOCK_RETRY_AUTH_FAILED_MESSAGE);
    return;
  }

  unwrap(
    await db()
      .from("profiles")
      .update({ status: "active", approved_at: target.approved_at ?? nowIso(), approved_by: target.approved_by ?? actor.id })
      .eq("id", userId)
      .select("id")
  );
  const unlocked = await setAuthBan(userId, false);
  // 상태는 실제로 바뀌었으므로 기록은 남긴다. 다만 절반만 됐다는 사실을 요약에 적어 둔다.
  const summary = `${actor.display_name}가 ${target.display_name}(${target.username}) 계정의 차단을 해제했습니다.`;
  await logUserAction(
    actor,
    target,
    "user.unblocked",
    unlocked ? summary : `${summary} (로그인 잠금 해제는 실패해 재시도가 필요합니다.)`
  );
  // 던지는 것은 기록을 남긴 뒤다. 여기서 먼저 던지면 상태만 바뀌고 흔적이 없는 편이 된다.
  if (!unlocked) throw new ValidationError(UNBLOCK_AUTH_FAILED_MESSAGE);
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
 *
 * **남의 기기에 남아 있던 세션까지 끊지는 못한다.** 세션을 끊으려면 그 사람의 토큰이 필요한데
 * 관리자는 그것을 갖고 있지 않다. 계정을 빼앗긴 것으로 의심되면 초기화만 하지 말고
 * **차단했다가 다시 풀어라.** 차단이 인증 쪽 계정을 잠가 남은 세션을 모두 끊는다.
 * 본인이 직접 바꾸는 경우(lib/auth/profile.ts)는 다른 기기의 세션을 끊는다.
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
