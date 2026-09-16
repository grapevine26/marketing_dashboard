import "server-only";
import { headers } from "next/headers";
import { db, unwrap } from "../db/client";

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
 * 세는 일은 DB 함수 하나로 한다(`bump_auth_throttle`, 0007 마이그레이션).
 * 전에는 여기서 읽고 더하고 덮어썼는데, 요청을 **동시에** 보내면 전부 같은 값을 읽어
 * N-1회가 사라졌다. 상한이 10회여도 병렬로 보내면 수백 번 시도할 수 있었다.
 * 그 함수는 anon 이 부르지 못하게 실행 권한을 회수해 두었다.
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
  // 세고 잠그는 것을 DB 함수 하나로 한다. 여기서 읽고 쓰면 동시 요청이 서로를 덮어쓴다.
  const lockedUntil = unwrap(
    await db().rpc("bump_auth_throttle", {
      p_key: key,
      p_max: policy.maxHits,
      p_window_seconds: policy.windowMs / 1000,
      p_lock_seconds: policy.lockMs / 1000,
    })
  ) as string | null;
  return Boolean(lockedUntil && Date.parse(lockedUntil) > Date.now());
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

/** IPv4 와 IPv6 에 쓰이는 글자만. 남이 보낸 값을 키로 쓰기 전에 거른다. */
const IP_SHAPE = /^[0-9a-fA-F.:]{3,45}$/;

/**
 * 요청한 쪽의 IP. 알 수 없으면 null.
 *
 * **`x-forwarded-for` 를 먼저 믿지 않는다.** 그 헤더는 요청하는 쪽이 마음대로 적어 보낼 수 있고,
 * 첫 값을 쓰면 요청마다 다른 값을 적는 것만으로 IP 기준 제한이 통째로 무의미해진다.
 * Vercel 이 직접 붙이는 `x-vercel-forwarded-for` 를 먼저 보고, 없을 때만 표준 헤더로 내려간다.
 *
 * 모양이 IP 같지 않으면 null 을 준다. 옛 코드는 이런 경우를 "unknown" 한 칸에 몰아넣었는데,
 * 그러면 한 사람이 30회 실패시켜 그 칸을 잠그는 순간 **같은 처지의 모든 사람이 로그인하지 못한다.**
 * 알 수 없으면 IP 기준 제한만 건너뛰고 아이디 기준 제한은 그대로 둔다.
 */
export async function getClientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const candidate = h.get("x-vercel-forwarded-for") || h.get("x-forwarded-for")?.split(",")[0];
    const value = candidate?.trim();
    if (value && IP_SHAPE.test(value)) return value;
  } catch {
    // headers() 컨텍스트가 없는 경우(테스트 등)
  }
  return null;
}

// ---------- 공개 폼 (로그인 없이 열리는 경로) ----------
//
// 여기도 DB 로 센다. 인메모리(rateLimit.ts)는 서버리스에서 요청마다 비워져 아무것도 막지 못한다.
// 특히 AI 는 부를 때마다 돈이 나가므로 실제로 막히는 장치가 있어야 한다.

/** 공개 폼 제출. 같은 링크·같은 곳에서 10분에 10회. */
export const PUBLIC_SUBMIT: ThrottlePolicy = { maxHits: 10, windowMs: 10 * MINUTE, lockMs: 10 * MINUTE };

/**
 * 인플루언서 지원 접수만 따로 둔다. 10분에 30회.
 *
 * 다른 공개 폼은 링크를 받은 **한 사람**이 쓴다(광고주 한 명, 담당자 한 명). 그런데 지원폼은
 * 링크를 오픈채팅이나 SNS 에 뿌려 **불특정 다수가 동시에** 들어온다. 게다가 국내 모바일 회선은
 * 여러 명이 같은 공인 IP 로 보이므로(CGNAT), 10회로 두면 **반응이 좋은 캠페인이 스스로 문을
 * 닫는다** — 먼저 온 열 명 때문에 열한 번째 사람이 아무 잘못 없이 10분간 막힌다.
 *
 * 그렇다고 없앨 수는 없다. 스크립트로 같은 폼을 두드리면 지원자 행과 감사 로그가 그대로 쌓인다.
 * 사람이 손으로 10분에 30번 지원할 일은 없으니 그 선에서 자른다.
 */
export const APPLY_SUBMIT: ThrottlePolicy = { maxHits: 30, windowMs: 10 * MINUTE, lockMs: 10 * MINUTE };
/**
 * 링크 하나 기준 상한. 1시간 100회.
 *
 * `PUBLIC_SUBMIT` 은 (링크 + IP) 로 센다. 그런데 IP 는 바꾸기 쉽다 — IPv6 는 한 회선이
 * 주소를 통째로 덩어리로 받고, 프록시는 얼마든지 구한다. IP 별로만 막으면 주소를
 * 갈아가며 사실상 무제한으로 부를 수 있다.
 *
 * 그래서 링크 자체에도 천장을 둔다. 정상적인 광고주 한 명이 1시간에 100번을 누를 일은
 * 없고, 넘겼다면 그 링크가 샜다는 뜻이다. 링크는 회수(재발급)할 수 있다.
 */
export const PUBLIC_BY_LINK: ThrottlePolicy = { maxHits: 100, windowMs: 60 * MINUTE, lockMs: 60 * MINUTE };
/** AI 초안, 링크 전체 기준. 10분에 20회. 여러 질문을 빠르게 훑는 것을 막는다. */
export const AI_BY_LINK: ThrottlePolicy = { maxHits: 20, windowMs: 10 * MINUTE, lockMs: 10 * MINUTE };
/** AI 초안, 질문 하나 기준. 하루 3회. 화면에 남은 횟수로 보여준다. */
export const AI_BY_QUESTION: ThrottlePolicy = { maxHits: 3, windowMs: 24 * 60 * MINUTE, lockMs: 24 * 60 * MINUTE };

export const publicSubmitKey = (kind: string, token: string, ip: string | null) =>
  `form:${kind}:${token}:${ip ?? "-"}`;
/** 링크 전체 기준 키. IP 를 섞지 않는다 — 그게 이 키의 요점이다. */
export const publicLinkKey = (kind: string, token: string) => `link:${kind}:${token}`;
export const aiLinkKey = (kind: string, token: string) => `ai:${kind}:${token}`;
export const aiQuestionKey = (kind: string, token: string, questionId: string) =>
  `ai:${kind}:${token}:${questionId}`;

/** 화면용 사용 횟수를 읽을 때 필요한 칸. 단수/복수 두 함수가 같은 칸을 읽어야 한다. */
interface UsageRow {
  failures: number;
  window_start: string;
  locked_until: string | null;
}
const USAGE_COLUMNS = "failures, window_start, locked_until";

/**
 * 한 행을 "지금까지 몇 번 썼나"로 옮기는 규칙. **단수/복수가 이 함수 하나만 쓴다.**
 * 규칙이 두 벌이면 언젠가 갈라지고, 갈라지는 순간 화면과 실제 잠금이 어긋난다.
 *
 * **잠금을 먼저 본다.** 창(windowMs)은 **첫 호출** 시각부터 흐르고, 잠금(lockMs)은
 * **상한에 닿은(세 번째) 호출** 시각부터 흐른다. `AI_BY_QUESTION` 은 둘 다 24시간이라
 * 창이 먼저 끝나고 잠금이 그 뒤까지 남는다.
 *
 *   09:00 1회(창 시작) → 23:00 2회 → 23:30 3회(잠금이 다음날 23:30까지)
 *   다음날 09:00 이후: 창은 끝났지만 잠금은 14시간 30분 더 남아 있다.
 *
 * 창만 보면 그 사이 화면은 "3회 가능"이라고 하고, 누르면 `isThrottled` 가 막는다.
 * 잠겨 있는 동안은 창이 지났더라도 다 쓴 것으로 본다 — 화면이 실제 잠금과 같은 말을 해야 한다.
 */
function usedHits(row: UsageRow, now: number, policy: ThrottlePolicy = AI_BY_QUESTION): number {
  const lockedUntil = row.locked_until ? Date.parse(row.locked_until) : NaN;
  if (Number.isFinite(lockedUntil) && lockedUntil > now) return policy.maxHits;
  // 잠기지 않았고 창도 지났으면 0 부터 다시 센다. 화면 숫자도 그래야 맞다.
  const started = Date.parse(row.window_start);
  if (!Number.isFinite(started) || now - started >= policy.windowMs) return 0;
  return row.failures;
}

/** 지금까지 몇 번 썼나. 화면에 "남은 횟수"를 보여줄 때만 쓴다. */
export async function getThrottleCount(key: string): Promise<number> {
  return softly(
    "사용 횟수 조회",
    async () => {
      const row = unwrap(
        await db().from("auth_throttle").select(USAGE_COLUMNS).eq("key", key).maybeSingle<UsageRow>()
      );
      if (!row) return 0;
      return usedHits(row, Date.now());
    },
    0
  );
}

/**
 * 여러 키의 사용 횟수를 **한 번의 조회로** 가져온다. 키 -> 횟수.
 *
 * 공개 신청폼은 질문마다 "AI 추천 남은 횟수" 를 보여준다. 질문 수만큼 따로 물으면
 * 그만큼 왕복하는데, **그 왕복이 순차라 질문이 8개면 8번을 줄줄이 기다린다.**
 * 로그인 없이 열리는 화면이라 그 시간이 그대로 첫 화면 지연이 된다.
 *
 * 없는 키는 결과에 담기지 않는다. 읽는 쪽에서 0 으로 다루면 된다.
 */
export async function getThrottleCounts(keys: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (keys.length === 0) return counts;
  return softly(
    "사용 횟수 일괄 조회",
    async () => {
      // 키가 몇 개든 조회는 한 번이다. 그게 이 함수의 존재 이유다(위 주석 참고).
      const rows = unwrap(
        await db()
          .from("auth_throttle")
          .select(`key, ${USAGE_COLUMNS}`)
          .in("key", keys)
          .returns<(UsageRow & { key: string })[]>()
      );
      const now = Date.now();
      for (const row of rows) {
        // 규칙은 getThrottleCount 와 **같은 함수**를 쓴다. 베껴 두면 언젠가 갈라진다.
        const used = usedHits(row, now);
        if (used > 0) counts.set(row.key, used);
      }
      return counts;
    },
    counts
  );
}

/**
 * 한 번 센 것을 돌려준다. AI 호출이 실패했을 때만 쓴다.
 *
 * 호출 **전에** 세는 이유는 동시에 여러 번 눌러도 상한을 넘지 않게 하기 위해서다.
 * 그 대신 실패하면 돌려줘야 사용자가 손해를 보지 않는다. 정확할 필요는 없다.
 */
export async function refundThrottle(key: string): Promise<void> {
  await softly(
    "사용 횟수 반환",
    async () => {
      const row = unwrap(
        await db().from("auth_throttle").select("failures").eq("key", key).maybeSingle<{ failures: number }>()
      );
      if (!row || row.failures <= 0) return;
      unwrap(
        await db()
          .from("auth_throttle")
          .update({ failures: row.failures - 1, locked_until: null })
          .eq("key", key)
          .select("key")
      );
    },
    undefined
  );
}
