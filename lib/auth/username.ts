import { ValidationError } from "../db/validation";

/**
 * 아이디와 내부용 이메일 사이의 변환.
 *
 * Supabase Auth 는 이메일 기반이라 아이디만으로는 가입·로그인이 안 된다.
 * 그래서 아이디 `kimmanager` 를 내부적으로 `kimmanager@moa.local` 로 바꿔 저장한다.
 * 사용자는 이 주소를 보지도 입력하지도 않는다. 화면에는 아이디 칸만 있다.
 *
 * 이 도메인은 실제로 메일을 받지 않는다. 그래서 Supabase 에서 이메일 확인(Confirm email)을
 * 꺼야 한다. 켜져 있으면 확인 메일이 발송되고 가입이 끝나지 않는다.
 *
 * **이름이 바뀌어도 이 도메인은 그대로 둔다.** 서비스 이름은 RB Global 로 바뀌었지만
 * 이미 가입한 계정은 모두 `<아이디>@moa.local` 로 저장되어 있다. 여기를 바꾸면
 * 기존 계정이 전부 로그인하지 못한다. 사용자에게 보이지 않는 값이라 바꿀 이유도 없다.
 */

export const INTERNAL_EMAIL_DOMAIN = "moa.local";

/** 영문 소문자로 시작하고, 소문자·숫자·밑줄만, 3~30자. */
const USERNAME_RE = /^[a-z][a-z0-9_]{2,29}$/;

export const USERNAME_RULE_TEXT = "아이디는 영문 소문자로 시작하고, 영문 소문자·숫자·밑줄만 써서 3~30자로 만들어주세요.";

export function isValidUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME_RE.test(value);
}

/**
 * 입력받은 아이디를 정리하고 검사한다.
 * 대소문자를 섞어 적어도 같은 계정으로 보도록 소문자로 낮춘다.
 */
export function normalizeUsername(raw: unknown): string {
  if (typeof raw !== "string") throw new ValidationError(USERNAME_RULE_TEXT);
  const value = raw.trim().toLowerCase();
  if (!isValidUsername(value)) throw new ValidationError(USERNAME_RULE_TEXT);
  return value;
}

/** 아이디 → 내부용 이메일. 로그인·가입에서 Supabase 로 넘길 값이다. */
export function usernameToEmail(username: string): string {
  return `${username}@${INTERNAL_EMAIL_DOMAIN}`;
}

/** 내부용 이메일 → 아이디. 화면에 보여줄 때 쓴다. */
export function emailToUsername(email: string | null | undefined): string {
  if (!email) return "";
  return email.split("@")[0] ?? "";
}

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_RULE_TEXT = `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 만들어주세요.`;

export function validatePassword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(PASSWORD_RULE_TEXT);
  }
  if (raw.length > 200) {
    throw new ValidationError("비밀번호가 너무 깁니다.");
  }
  return raw;
}

export function validateDisplayName(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ValidationError("이름을 입력해주세요.");
  }
  const value = raw.trim();
  if (value.length > 50) throw new ValidationError("이름은 50자 이내로 입력해주세요.");
  return value;
}
