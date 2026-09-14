import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: { url: string; client: SupabaseClient } | null = null;

/**
 * 서버 전용 Supabase 클라이언트.
 *
 * service_role 키를 쓰므로 RLS 를 우회한다. 브라우저 번들에 들어가면 안 되기 때문에
 * 이 파일은 `server-only` 로 시작한다. 환경변수는 호출 시점에 읽는다. 테스트가
 * 테스트 프로젝트 값으로 덮어쓴 뒤에 클라이언트를 만들 수 있어야 하기 때문이다.
 */
export function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. .env.local 을 확인하세요.");
  }
  if (cached && cached.url === url) return cached.client;
  cached = {
    url,
    client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
  return cached.client;
}
