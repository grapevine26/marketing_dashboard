import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * 로그인·세션 전용 Supabase 클라이언트.
 *
 * 데이터는 admin.ts(service_role)가 읽고 쓴다. 이 파일은 인증만 맡는다.
 * anon 키를 쓰지만 브라우저로 나가지는 않는다. 로그인은 전부 서버 액션에서 처리하고,
 * 브라우저는 Supabase 와 직접 통신하지 않는다.
 */

/** "로그인 상태 유지" 선택을 기억하는 쿠키. 세션이 갱신될 때 만료를 다시 정하는 데 쓴다. */
export const PERSIST_COOKIE = "moa_persist";

/** 체크했을 때의 쿠키 수명. 브라우저가 인정하는 상한(400일)에 맞춘다. */
const PERSIST_MAX_AGE = 400 * 24 * 60 * 60;

/**
 * 인증 쿠키의 만료를 정한다.
 *
 * - 유지를 택했으면 긴 만료를 준다. 브라우저를 닫아도 남는다.
 * - 아니면 만료를 주지 않는다(세션 쿠키). 브라우저를 닫으면 사라진다.
 *
 * Supabase 가 준 maxAge 를 그대로 쓰면 선택이 무시되므로 여기서 덮어쓴다.
 */
function applyPersistence(options: CookieOptions, persist: boolean): CookieOptions {
  const base: CookieOptions = { ...options, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" };
  if (persist) return { ...base, maxAge: PERSIST_MAX_AGE };
  // 만료를 빼면 세션 쿠키가 된다. 브라우저를 닫으면 사라진다.
  const rest = { ...base };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}

function requireEnv(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL 과 SUPABASE_ANON_KEY 가 필요합니다. .env.local 을 확인하세요.");
  }
  return { url, anonKey };
}

/**
 * 서버 컴포넌트·서버 액션용. 쿠키를 읽고 쓴다.
 *
 * 서버 컴포넌트에서는 쿠키 쓰기가 막혀 있어 set 이 예외를 던진다. 세션 갱신은 프록시가
 * 맡으므로 그 예외는 무시해도 된다.
 */
export async function createAuthClient(persistOverride?: boolean): Promise<SupabaseClient> {
  const { url, anonKey } = requireEnv();
  const store = await cookies();
  const persist = persistOverride ?? store.get(PERSIST_COOKIE)?.value === "1";

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, applyPersistence(options ?? {}, persist));
          }
        } catch {
          // 서버 컴포넌트에서 부른 경우. 갱신은 프록시가 한다.
        }
      },
    },
  });
}

/**
 * 프록시용. 요청 쿠키를 읽고, 갱신된 쿠키를 응답에 싣는다.
 * 프록시는 next/headers 의 cookies() 를 쓸 수 없어 별도로 둔다.
 */
export function createProxyAuthClient(
  getAll: () => { name: string; value: string }[],
  setCookie: (name: string, value: string, options: CookieOptions) => void,
  persist: boolean
): SupabaseClient {
  const { url, anonKey } = requireEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll,
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(name, value, applyPersistence(options ?? {}, persist));
        }
      },
    },
  });
}

/** 로그인할 때 선택을 기억시킨다. 이후 갱신에서 같은 만료가 유지된다. */
export async function rememberPersistence(persist: boolean): Promise<void> {
  const store = await cookies();
  if (persist) {
    store.set(PERSIST_COOKIE, "1", {
      maxAge: PERSIST_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  } else {
    store.set(PERSIST_COOKIE, "0", {
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
}

export async function clearPersistence(): Promise<void> {
  const store = await cookies();
  store.delete(PERSIST_COOKIE);
}
