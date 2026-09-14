import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { db, unwrap, unwrapMaybe } from "../db/client";
import { insertAuditLog } from "../db/audit";
import { ValidationError } from "../db/validation";
import type { SessionUser } from "./roles";

/**
 * 가입 초대 코드.
 *
 * 가입 화면이 아무에게나 열려 있으면 승인 대기 목록이 낯선 신청으로 채워진다.
 * 코드 하나를 대표 관리자가 만들어 가입할 사람에게 직접 건네고, 서버가 대조한다.
 *
 * 코드는 `app_settings` 에 한 행으로 있다. **행이 없으면 가입을 받지 않는다.**
 * 열어 두는 쪽이 편하지만, 코드를 만들기 전까지 누구나 가입할 수 있는 구멍이 된다.
 * 마이그레이션이 초기 값을 넣지 않는 것도 같은 이유다. 코드는 사람이 만들어야 한다.
 */

export const SIGNUP_INVITE_CODE_KEY = "signup_invite_code";

/** 헷갈리는 0/O/1/I 를 뺀 영대문자와 숫자. 사람이 받아 적고 읽어 주는 값이라서다. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

export const NO_INVITE_CODE_TEXT = "아직 가입을 받지 않습니다. 관리자에게 문의하세요.";
export const WRONG_INVITE_CODE_TEXT = "초대 코드가 올바르지 않습니다.";

/** 8자 코드를 crypto 난수로 만든다. Math.random 은 예측할 수 있어 쓰지 않는다. */
export function generateInviteCode(): string {
  let out = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/** 입력한 코드를 저장된 코드와 같은 모양으로 맞춘다. 대소문자와 앞뒤 공백은 보지 않는다. */
function normalizeCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

/** 지금 설정된 코드. 없으면 null. 대표 관리자 화면에만 보여준다. */
export async function getSignupInviteCode(): Promise<string | null> {
  try {
    const row = unwrapMaybe(
      await db().from("app_settings").select("value").eq("key", SIGNUP_INVITE_CODE_KEY).maybeSingle<{ value: string }>()
    );
    return row?.value ?? null;
  } catch (err) {
    // 표를 못 읽으면 "코드 없음" 으로 본다. 곧 가입이 막힌다는 뜻이고, 그게 안전한 쪽이다.
    // 읽기 실패로 아무나 가입되는 일은 없어야 한다. 표가 아직 없을 때도 여기로 온다.
    console.error("[settings] 초대 코드를 읽지 못했습니다. 가입을 닫습니다:", err);
    return null;
  }
}

/**
 * 가입 요청이 낸 코드를 대조한다. 맞지 않으면 ValidationError.
 * 비교는 길이에 상관없이 같은 시간이 걸리게 한다. 한 글자씩 맞춰 가며 시간을 재는 것을 막는다.
 */
export async function verifySignupInviteCode(raw: unknown): Promise<void> {
  const expected = await getSignupInviteCode();
  if (!expected) throw new ValidationError(NO_INVITE_CODE_TEXT);

  const given = normalizeCode(raw);
  const a = Buffer.from(given.padEnd(expected.length, "\0"));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ValidationError(WRONG_INVITE_CODE_TEXT);
  }
}

/**
 * 코드를 새로 만들어 저장한다. 이전 코드는 그 자리에서 무효가 된다.
 * 감사 로그에는 "새로 만들었다"만 남기고 코드 값은 넣지 않는다. 기록을 보는 사람이 곧 가입할 수 있으면 안 된다.
 */
export async function rotateSignupInviteCode(actor: SessionUser): Promise<string> {
  if (actor.role !== "owner") {
    throw new ValidationError("가입 초대 코드는 대표 관리자만 바꿀 수 있습니다.");
  }
  const code = generateInviteCode();
  unwrap(
    await db()
      .from("app_settings")
      .upsert({ key: SIGNUP_INVITE_CODE_KEY, value: code, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .select("key")
  );
  await insertAuditLog({
    entity_type: "user",
    entity_id: actor.id,
    action: "signup_code.rotated",
    actor_type: "agency",
    actor_name: actor.display_name,
    summary: `${actor.display_name}가 가입 초대 코드를 새로 만들었습니다.`,
    details: { actor_username: actor.username },
  });
  return code;
}
