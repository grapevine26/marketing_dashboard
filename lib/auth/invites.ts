import "server-only";
import { randomBytes } from "node:crypto";
import { db, unwrap, unwrapMaybe } from "../db/client";
import { insertAuditLog } from "../db/audit";
import { ValidationError, nowIso } from "../db/validation";
import type { SessionUser } from "./roles";
import { INVITE_TTL_HOURS, type SignupInvite } from "./invite-types";

// 값과 모양은 화면도 쓰므로 server-only 가 아닌 파일에 두고 여기서 다시 내보낸다.
export { INVITE_TTL_HOURS, type SignupInvite };

/**
 * 가입 초대 링크.
 *
 * 대표 관리자가 사람마다 링크를 하나씩 만들어 건네고, 그 링크로 들어온 사람만 가입할 수 있다.
 * **링크는 계정이 실제로 만들어지는 순간 죽는다.** 전달받은 사람이 또 써도 열리지 않는다.
 *
 * 만료보다 1회용인 것이 핵심이다. 한 번 쓰면 죽으므로 만료를 며칠로 잡아도 위험하지 않고,
 * 반대로 만료만 짧고 여러 번 쓸 수 있으면 그 시간 동안은 모두가 같은 코드를 쓰는 것과 같다.
 *
 * 초대는 가입 신청을 걸러낼 뿐이고, 실제로 들어올 수 있는지는 **승인**이 정한다.
 * 그래서 여기서 완벽을 노리지 않는다. 대기 목록을 깨끗하게 유지하는 것이 목적이다.
 */

export const INVITE_INVALID_TEXT =
  "이 초대 링크는 쓸 수 없습니다. 이미 사용했거나 기한이 지났습니다. 관리자에게 새 링크를 요청하세요.";
export const INVITE_REQUIRED_TEXT = "가입은 초대 링크로만 할 수 있습니다. 관리자에게 링크를 요청하세요.";

interface InviteRow {
  token: string;
  label: string | null;
  created_by_name: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
}

/**
 * 192비트 난수. 주소창에 그대로 들어가므로 base64url 로 만든다.
 *
 * 이 값 하나가 가입 권한이라 추측이 가능하면 안 된다. Math.random 은 예측할 수 있어 쓰지 않는다.
 */
function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function onlyOwner(actor: SessionUser, what: string): void {
  if (actor.role !== "owner") {
    throw new ValidationError(`초대 링크는 대표 관리자만 ${what} 수 있습니다.`);
  }
}

/** 새 초대 링크를 만든다. 대표 관리자만. `label` 은 누구에게 줄 링크인지 적는 메모다. */
export async function createSignupInvite(actor: SessionUser, rawLabel: unknown): Promise<SignupInvite> {
  onlyOwner(actor, "만들");
  const label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim().slice(0, 100) : null;
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const row = unwrap(
    await db()
      .from("signup_invites")
      .insert({
        token,
        label,
        created_by: actor.id,
        created_by_name: actor.display_name,
        expires_at: expiresAt,
      })
      .select("token, label, created_by_name, expires_at, created_at")
      .single<SignupInvite>()
  );

  // 기록에 토큰 값은 넣지 않는다. 기록을 볼 수 있는 사람이 곧 그 링크로 가입할 수 있으면 안 된다.
  await insertAuditLog({
    entity_type: "user",
    entity_id: actor.id,
    action: "signup_invite.created",
    actor_type: "agency",
    actor_name: actor.display_name,
    summary: `${actor.display_name}가 가입 초대 링크를 만들었습니다${label ? ` (${label})` : ""}.`,
    details: { label },
  });
  return row;
}

/** 아직 쓰지 않았고 기한도 남은 초대. 대표 관리자 화면에서 보여준다. */
export async function listOpenInvites(): Promise<SignupInvite[]> {
  return unwrap(
    await db()
      .from("signup_invites")
      .select("token, label, created_by_name, expires_at, created_at")
      .is("used_at", null)
      .gt("expires_at", nowIso())
      .order("created_at", { ascending: false })
      .returns<SignupInvite[]>()
  );
}

/** 잘못 만들었거나 보내지 않기로 한 링크를 회수한다. 대표 관리자만. */
export async function revokeSignupInvite(actor: SessionUser, token: unknown): Promise<void> {
  onlyOwner(actor, "회수할");
  if (typeof token !== "string" || !token) throw new ValidationError("회수할 링크를 찾을 수 없습니다.");

  const row = unwrapMaybe(
    await db().from("signup_invites").delete().eq("token", token).is("used_at", null).select("label").maybeSingle<{ label: string | null }>()
  );
  // 이미 쓰였거나 없는 링크. 어느 쪽이든 지금은 쓸 수 없는 상태라 굳이 구분해 알리지 않는다.
  if (!row) throw new ValidationError("이미 사용했거나 없는 링크입니다.");

  await insertAuditLog({
    entity_type: "user",
    entity_id: actor.id,
    action: "signup_invite.revoked",
    actor_type: "agency",
    actor_name: actor.display_name,
    summary: `${actor.display_name}가 가입 초대 링크를 회수했습니다${row.label ? ` (${row.label})` : ""}.`,
    details: { label: row.label },
  });
}

/**
 * 가입 화면이 링크를 열 때 쓰는 확인. 살아 있으면 정보를, 아니면 null 을 준다.
 * 여기서는 아직 소모하지 않는다. 화면만 열어 본 것으로 링크가 죽으면 안 된다.
 */
export async function peekSignupInvite(token: string): Promise<SignupInvite | null> {
  if (!token) return null;
  try {
    const row = unwrapMaybe(
      await db()
        .from("signup_invites")
        .select("token, label, created_by_name, expires_at, created_at, used_at")
        .eq("token", token)
        .maybeSingle<InviteRow>()
    );
    if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) return null;
    // used_at 은 밖으로 내보내지 않는다. 화면이 알아야 할 것은 "쓸 수 있는가" 뿐이다.
    return {
      token: row.token,
      label: row.label,
      created_by_name: row.created_by_name,
      expires_at: row.expires_at,
      created_at: row.created_at,
    };
  } catch (err) {
    // 표를 못 읽으면 초대가 없는 것으로 본다. 곧 가입이 막힌다는 뜻이고, 그게 안전한 쪽이다.
    console.error("[invites] 초대 링크를 읽지 못했습니다. 가입을 닫습니다:", err);
    return null;
  }
}

/**
 * 소모했던 링크를 되돌린다. 계정 만들기가 실패했을 때만 쓴다.
 * 비밀번호가 짧아서 실패한 사람이 링크를 잃으면 안 된다.
 */
export async function releaseSignupInvite(token: string): Promise<void> {
  try {
    unwrap(
      await db()
        .from("signup_invites")
        .update({ used_at: null, used_by_username: null })
        .eq("token", token)
        .select("token")
    );
  } catch (err) {
    // 되돌리기에 실패해도 가입 실패는 이미 사용자에게 알렸다. 링크 하나를 잃을 뿐이다.
    console.error("[invites] 링크 되돌리기 실패:", err);
  }
}

/**
 * 링크를 소모한다. **계정을 만들기 전에** 부른다.
 *
 * 조건을 건 update 한 번이라 둘이 같은 링크를 동시에 눌러도 **한 명만** 성공한다.
 *
 * 전에는 계정을 만든 뒤에 소모했다. 그러면 요청을 동시에 여러 개 보냈을 때 전부 "아직 안 쓰임"을
 * 보고 통과해, 초대 하나로 계정을 여러 개 만들 수 있었다. 지금은 먼저 소모하고 계정 만들기가
 * 실패하면 releaseSignupInvite 로 되돌린다. 오타로 링크를 잃지 않으면서 중복도 막는다.
 */
export async function consumeSignupInvite(token: string, username: string): Promise<boolean> {
  const row = unwrapMaybe(
    await db()
      .from("signup_invites")
      .update({ used_at: nowIso(), used_by_username: username })
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", nowIso())
      .select("token")
      .maybeSingle<{ token: string }>()
  );
  return Boolean(row);
}
