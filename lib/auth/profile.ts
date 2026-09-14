import "server-only";
import { createClient } from "@supabase/supabase-js";
import { db, unwrap } from "../db/client";
import { insertAuditLog } from "../db/audit";
import { ValidationError } from "../db/validation";
import { getAdminClient } from "../supabase/admin";
import { createAuthClient } from "../supabase/auth";
import type { SessionUser } from "./roles";
import { usernameToEmail, validateDisplayName, validatePassword } from "./username";

/**
 * 본인 정보 변경.
 *
 * 관리자용 `users.ts` 와 나눠 둔 이유: 저기는 "남을 관리하는" 곳이라 등급 검사가 붙는다.
 * 여기는 "자기 것을 고치는" 곳이라 등급과 무관하고, 대상이 항상 로그인한 본인이다.
 */

export async function updateMyDisplayName(me: SessionUser, raw: unknown): Promise<string> {
  const displayName = validateDisplayName(raw);
  if (displayName === me.display_name) return displayName;

  unwrap(await db().from("profiles").update({ display_name: displayName }).eq("id", me.id).select("id"));

  await insertAuditLog({
    entity_type: "user",
    entity_id: me.id,
    action: "user.name_changed",
    actor_type: "agency",
    actor_name: displayName,
    summary: `${me.display_name}님이 이름을 [${displayName}](으)로 바꿨습니다.`,
    details: { previous: me.display_name, next: displayName },
  });
  return displayName;
}

/**
 * 본인 비밀번호 변경.
 *
 * **현재 비밀번호를 반드시 확인한다.** 로그인한 브라우저를 잠깐 빌린 사람이 비밀번호를
 * 바꿔 계정을 통째로 가져가는 것을 막는다.
 *
 * 확인은 따로 만든 클라이언트로 한다. 공용 클라이언트로 로그인하면 그 클라이언트의
 * 권한이 로그인한 사용자 것으로 바뀌어, 이후 조회가 조용히 막힌다.
 */
export async function changeMyPassword(me: SessionUser, current: unknown, next: unknown): Promise<void> {
  if (typeof current !== "string" || !current) {
    throw new ValidationError("현재 비밀번호를 입력해주세요.");
  }
  const nextPassword = validatePassword(next);
  if (current === nextPassword) {
    throw new ValidationError("지금 쓰는 비밀번호와 다른 것으로 바꿔주세요.");
  }

  // 확인용 클라이언트는 서버 전용 키로 만든다.
  //
  // anon 키를 쓰면 키가 프로젝트와 어긋났을 때 "현재 비밀번호가 틀렸다"는 엉뚱한 메시지가 나온다.
  // 원인을 찾기 어려운 실패다(실제로 테스트에서 겪었다). 이 코드는 서버에서만 도니
  // 이미 가지고 있는 키를 쓰면 그 어긋남 자체가 생기지 않는다.
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");

  const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await verifier.auth.signInWithPassword({
    email: usernameToEmail(me.username),
    password: current,
  });
  if (signInError) {
    throw new ValidationError("현재 비밀번호가 올바르지 않습니다.");
  }

  const { error } = await getAdminClient().auth.admin.updateUserById(me.id, { password: nextPassword });
  if (error) throw new Error(`[auth] 비밀번호 변경 실패: ${error.message}`);

  // 다른 기기에 남아 있던 로그인을 끊는다. 비밀번호를 바꾸는 이유가 대개 그것이다.
  // "others" 라서 지금 쓰는 브라우저는 그대로 남고, 위에서 확인용으로 만든 세션도 함께 정리된다.
  try {
    const mine = await createAuthClient();
    await mine.auth.signOut({ scope: "others" });
  } catch (err) {
    // 여기서 실패해도 비밀번호는 이미 바뀌었다. 되돌리지 않고 기록만 남긴다.
    console.error("[auth] 다른 기기 세션 정리 실패:", err);
  }

  await insertAuditLog({
    entity_type: "user",
    entity_id: me.id,
    action: "user.password_changed",
    actor_type: "agency",
    actor_name: me.display_name,
    summary: `${me.display_name}님이 비밀번호를 바꿨습니다.`,
  });
}
