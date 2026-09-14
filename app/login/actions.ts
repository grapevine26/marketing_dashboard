"use server";

import { ValidationError } from "@/lib/db";
import { ActionResult, runAction } from "@/lib/actions/result";
import { normalizeUsername, usernameToEmail } from "@/lib/auth/username";
import { signUpUser } from "@/lib/auth/users";
import { verifySignupInviteCode } from "@/lib/auth/settings";
import { clearPersistence, createAuthClient, rememberPersistence } from "@/lib/supabase/auth";
import {
  LOGIN_BY_IP,
  LOGIN_BY_USERNAME,
  SIGNUP_BY_IP,
  clearThrottle,
  getClientIp,
  hitThrottle,
  isThrottled,
  loginIpKey,
  loginUserKey,
  signupIpKey,
  sweepThrottleOccasionally,
} from "@/lib/security/throttle";

/**
 * 로그인·가입·로그아웃 서버 액션.
 *
 * 로그인 전에 부르는 액션이라 `runAuthedAction` 을 쓰면 안 된다. 전부 맨 `runAction` 이다.
 * 대신 여기서 하는 일은 인증뿐이라 데이터에 닿지 않는다.
 *
 * 리다이렉트는 액션 안에서 하지 않는다. `redirect()` 는 예외를 던지는 방식이라
 * ActionResult 흐름과 섞이면 성공인지 실패인지 호출부에서 알아보기 어려워진다.
 * 어디로 보낼지만 정해서 돌려주고, 이동은 화면 쪽에서 router 로 한다.
 */

/**
 * 로그인 후 돌아갈 경로를 안전한 값으로 정리한다.
 *
 * `?next=https://남의사이트` 같은 값을 그대로 쓰면 로그인 화면이 외부로 튕기는
 * 오픈 리다이렉트가 된다. 그래서 **내부 경로만** 통과시킨다.
 * - `/` 로 시작해야 한다
 * - `//` 나 `/\` 로 시작하면 안 된다. 브라우저가 이걸 다른 호스트로 읽는다
 * - 로그인·가입 화면으로 되돌아가는 값은 무의미하므로 홈으로 바꾼다
 */
function sanitizeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const value = raw.trim();
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === "/login" || value === "/signup" || value.startsWith("/login?") || value.startsWith("/signup?")) {
    return "/";
  }
  return value;
}

/** 아이디·비밀번호가 맞지 않을 때 쓰는 한 가지 문구. */
const CREDENTIAL_ERROR = "아이디 또는 비밀번호가 올바르지 않습니다.";

export async function loginAction(input: {
  username: unknown;
  password: unknown;
  persist: boolean;
  next?: string | null;
}): Promise<ActionResult<{ next: string }>> {
  return runAction(async () => {
    // 아이디 형식이 애초에 규칙에 맞지 않으면 그것도 같은 문구로 돌려준다.
    // 형식 안내를 따로 띄우면 "그런 아이디는 없다"는 정보가 되어버린다.
    let username: string | null = null;
    try {
      username = normalizeUsername(input.username);
    } catch {
      username = null;
    }

    // 실패 횟수는 아이디와 IP 양쪽으로 센다.
    // 아이디만 세면 아이디를 바꿔 가며 훑을 수 있고, IP 만 세면 한 계정을 여러 곳에서 두드릴 수 있다.
    const ipKey = loginIpKey(await getClientIp());
    const userKey = username ? loginUserKey(username) : null;
    const keys = userKey ? [ipKey, userKey] : [ipKey];

    // 잠긴 동안은 비밀번호가 맞아도 거부한다. 문구는 평소 실패와 똑같이 둔다.
    // "잠겼다"고 알려주면 그 아이디가 존재한다는 것과 얼마나 두드렸는지를 함께 알려주게 된다.
    if (await isThrottled(keys)) throw new ValidationError(CREDENTIAL_ERROR);

    const recordFailure = () =>
      Promise.all(keys.map((k) => hitThrottle(k, k === ipKey ? LOGIN_BY_IP : LOGIN_BY_USERNAME)));

    if (!username || typeof input.password !== "string" || input.password.length === 0) {
      await recordFailure();
      throw new ValidationError(CREDENTIAL_ERROR);
    }
    const email = usernameToEmail(username);

    // 유지 선택을 signInWithPassword 보다 **먼저** 기록한다.
    // 로그인이 성공하면서 인증 쿠키가 바로 쓰이는데, 그때 쿠키 핸들러가 이 값을 보고
    // 만료를 정한다. 나중에 기록하면 첫 쿠키가 잘못된 만료로 굳는다.
    await rememberPersistence(input.persist);

    const supabase = await createAuthClient(input.persist);
    const { error } = await supabase.auth.signInWithPassword({ email, password: input.password });

    // 아이디가 없는 건지 비밀번호가 틀린 건지 구분해서 알려주지 않는다.
    // 구분해주면 아이디 목록을 훑어 계정이 있는지 알아낼 수 있다.
    // 차단(ban)된 계정도 인증 서버가 여기서 거부하며, 같은 이유로 같은 문구를 쓴다.
    if (error) {
      await recordFailure();
      throw new ValidationError(CREDENTIAL_ERROR);
    }

    // 성공했으니 이 아이디의 실패 기록은 지운다. IP 쪽은 그대로 둔다.
    // 같은 IP 에서 다른 아이디를 계속 두드리는 것까지 풀어 주면 안 된다.
    await clearThrottle(loginUserKey(username));
    await sweepThrottleOccasionally();

    return { next: sanitizeNext(input.next) };
  });
}

const SIGNUP_THROTTLED_TEXT = "가입 시도가 너무 많습니다. 1시간 뒤에 다시 시도해주세요.";

/**
 * 가입. 성공해도 바로 로그인시키지 않는다.
 *
 * 가입 직후 상태는 `pending` 이라 로그인해도 대기 화면밖에 볼 게 없다.
 * "가입됨 → 승인 기다리는 중"을 한 화면에서 알려주고, 로그인은 나중에 직접 하게 하는 편이
 * 흐름이 분명하다.
 */
export async function signupAction(input: {
  username: unknown;
  display_name: unknown;
  password: unknown;
  invite_code: unknown;
}): Promise<ActionResult<{ username: string }>> {
  return runAction(async () => {
    // IP 당 시도 횟수를 센다. 코드가 틀려도, 아이디가 겹쳐도 한 번으로 친다.
    // 초대 코드를 맞히려는 시도가 곧 가입 시도이기 때문이다.
    const ipKey = signupIpKey(await getClientIp());
    if (await isThrottled([ipKey])) throw new ValidationError(SIGNUP_THROTTLED_TEXT);
    await hitThrottle(ipKey, SIGNUP_BY_IP);

    // 코드를 아이디·비밀번호 검사보다 먼저 본다. 코드가 없는 사람에게 아이디 중복 여부까지 알려줄 이유가 없다.
    await verifySignupInviteCode(input.invite_code);

    return signUpUser({
      username: input.username,
      display_name: input.display_name,
      password: input.password,
    });
  });
}

export async function logoutAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const supabase = await createAuthClient();
    await supabase.auth.signOut();
    // 유지 선택도 같이 지운다. 다음 사람이 이 브라우저에서 로그인할 때 영향받지 않도록.
    await clearPersistence();
    return null;
  });
}
