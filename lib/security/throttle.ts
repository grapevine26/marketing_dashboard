import "server-only";
import { headers } from "next/headers";
import { db, unwrap, unwrapMaybe } from "../db/client";

/**
 * 시도 제한은 **보조 방어선**이다. 진짜 관문은 비밀번호 검사다.
 *
 * 그래서 이 표를 읽거나 쓰다 실패해도 로그인을 막지 않는다. 표가 아직 없거나(마이그레이션 전)
 * DB 가 잠깐 흔들릴 때 로그인 전체가 멈추는 편이 훨씬 큰 사고다. 대신 반드시 로그로 남긴다.
 * 이 로그가 보이면 0005 마이그레이션이 적용됐는지부터 확인할 것.
 */
async function softly<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[throttle] ${what} 실패 — 시도 제한 없이 진행합니다:`, err);
    return fallback;
  }
}

/**
 * DB 기반 시도 제한. 로그인 실패와 가입 시도를 센다.
 *
 * `rateLimit.ts` 의 메모리 Map 은 서버리스에서 요청마다 비워져 아무것도 막지 못한다.
 * 인증처럼 반드시 막혀야 하는 곳은 여기를 쓴다. 한 행이 키 하나의 창(window)과 잠금이다.
 *
 * 흐름은 두 단계다.
 *   1. `isThrottled(keys)`  잠긴 키가 하나라도 있으면 시도 자체를 거부한다.
 *   2. `hitThrottle(key, policy)`  실패(또는 시도)를 1회 더한다. 창 안의 횟수가 상한에 닿으면 잠근다.
 *
 * 동시에 들어온 두 실패가 같은 값을 읽고 쓰면 한 번이 덜 세어질 수 있다. 원자적 RPC 함수로
 * 막을 수도 있지만, 그러면 public 스키마 함수가 REST 로 노출돼 anon 이 아무 키나 잠글 수 있는
 * 새 구멍을 막아야 한다. 한 번 덜 세는 쪽이 싸다.
 */

export interface ThrottlePolicy {
  /** 창 안에서 허용하는 최대 실패(시도) 횟수. 이 값에 닿으면 잠근다. */
  maxHits: number;
  /** 횟수를 세는 창의 길이. */
  windowMs: number;
  /** 잠그는 시간. */
  lockMs: number;
}

const MINUTE = 60 * 1000;

/** 같은 아이디: 15분 안 10회 실패 → 15분 잠금. */
export const LOGIN_BY_USERNAME: ThrottlePolicy = { maxHits: 10, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE };
/** 같은 IP: 15분 안 30회 실패 → 15분 잠금. 아이디를 바꿔가며 훑는 것을 막는다. */
export const LOGIN_BY_IP: ThrottlePolicy = { maxHits: 30, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE };
/** 같은 IP: 1시간 안 5회 가입 시도 → 1시간 잠금. 실패뿐 아니라 모든 시도를 센다. */
export const SIGNUP_BY_IP: ThrottlePolicy = { maxHits: 5, windowMs: 60 * MINUTE, lockMs: 60 * MINUTE };

export const loginUserKey = (username: string) => `login:${username}`;
export const loginIpKey = (ip: string) => `login-ip:${ip}`;
export const signupIpKey = (ip: string) => `signup-ip:${ip}`;

interface ThrottleRow {
  key: string;
  failures: number;
  window_start: string;
  locked_until: string | null;
}

/** 주어진 키 가운데 지금 잠긴 것이 있는가. */
export async function isThrottled(keys: string[]): Promise<boolean> {
  if (keys.length === 0) return false;
  return softly("잠금 확인", () => readLocked(keys), false);
}

async function readLocked(keys: string[]): Promise<boolean> {
  const rows = unwrap(
    await db()
      .from("auth_throttle")
      .select("key")
      .in("key", keys)
      .gt("locked_until", new Date().toISOString())
      .returns<{ key: string }[]>()
  );
  return rows.length > 0;
}

/**
 * 실패(또는 시도)를 1회 더한다. 창이 지났으면 새로 센다.
 * 돌려주는 값은 "이 호출로 잠겼거나 이미 잠겨 있는가".
 */
export async function hitThrottle(key: string, policy: ThrottlePolicy): Promise<boolean> {
  return softly("실패 기록", () => bumpThrottle(key, policy), false);
}

async function bumpThrottle(key: string, policy: ThrottlePolicy): Promise<boolean> {
  const now = Date.now();
  const existing = unwrapMaybe(
    await db().from("auth_throttle").select("key, failures, window_start, locked_until").eq("key", key).maybeSingle<ThrottleRow>()
  );

  let failures = 1;
  let windowStart = now;
  if (existing) {
    const started = Date.parse(existing.window_start);
    if (Number.isFinite(started) && now - started < policy.windowMs) {
      failures = existing.failures + 1;
      windowStart = started;
    }
  }

  // 아직 남아 있는 잠금은 유지한다. 새로 상한에 닿았으면 지금부터 다시 잠근다.
  const carriedLock =
    existing?.locked_until && Date.parse(existing.locked_until) > now ? existing.locked_until : null;
  const lockedUntil = failures >= policy.maxHits ? new Date(now + policy.lockMs).toISOString() : carriedLock;

  unwrap(
    await db()
      .from("auth_throttle")
      .upsert(
        { key, failures, window_start: new Date(windowStart).toISOString(), locked_until: lockedUntil },
        { onConflict: "key" }
      )
      .select("key")
  );
  return lockedUntil !== null;
}

/** 키의 기록을 지운다. 로그인에 성공한 아이디에 쓴다. */
export async function clearThrottle(key: string): Promise<void> {
  await softly("기록 삭제", async () => {
    unwrap(await db().from("auth_throttle").delete().eq("key", key).select("key"));
  }, undefined);
}

/**
 * 하루 넘게 손대지 않은 행을 지운다. 로그인마다 부르되 1/50 확률로만 실제로 돈다.
 * 잠금은 길어야 1시간이라 하루 지난 행에 살아 있는 잠금은 없다. 실패해도 로그인을 막지 않는다.
 */
export async function sweepThrottleOccasionally(): Promise<void> {
  if (Math.random() >= 1 / 50) return;
  const cutoff = new Date(Date.now() - 24 * 60 * MINUTE).toISOString();
  const { error } = await db().from("auth_throttle").delete().lt("window_start", cutoff);
  if (error) console.error("[throttle] 정리 실패:", error.message);
}

/**
 * 요청한 쪽의 IP. Vercel 이 `x-forwarded-for` 에 채워 준다. 첫 값이 실제 클라이언트다.
 * 없으면 "unknown" 으로 묶어 센다. 로컬 개발이나 헤더가 없는 환경이 여기 들어온다.
 */
export async function getClientIp(): Promise<string> {
  try {
    const forwarded = (await headers()).get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    // 헤더는 남이 보낼 수도 있는 값이다. 키가 끝없이 길어지지 않게 자른다.
    if (first) return first.slice(0, 64);
  } catch {
    // headers() 컨텍스트가 없는 경우(테스트 등)
  }
  return "unknown";
}
