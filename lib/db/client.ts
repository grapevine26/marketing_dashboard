import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "../supabase/admin";

/** 서버 전용 admin 클라이언트. 모든 DB 모듈이 이걸로 쿼리한다. */
export function db(): SupabaseClient {
  return getAdminClient();
}

/**
 * supabase-js 응답을 값으로 바꾼다. 에러가 있으면 던진다.
 * PostgREST 는 예외를 던지지 않고 { data, error } 로 돌려주므로, 매번 확인하지 않으면 조용히 넘어간다.
 */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) {
    throw new Error(`[db] ${res.error.message}${res.error.details ? ` (${res.error.details})` : ""}`);
  }
  return res.data as T;
}

/** 단일 행 조회 결과. 없으면 null. */
export function unwrapMaybe<T>(res: { data: T | null; error: PostgrestError | null }): T | null {
  if (res.error) {
    throw new Error(`[db] ${res.error.message}${res.error.details ? ` (${res.error.details})` : ""}`);
  }
  return res.data ?? null;
}
