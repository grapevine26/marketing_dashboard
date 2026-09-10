import crypto from "crypto";

/**
 * AI 응답 캐시 (프로세스 메모리, TTL 24시간).
 *
 * 같은 입력으로 "AI 초안" 버튼을 여러 번 누르는 경우가 흔해서 호출 비용과 대기 시간을 줄인다.
 * - 폴백(실패) 결과는 캐시하지 않는다. 다음 시도에서 다시 호출되어야 한다.
 * - 서버 재시작 시 사라진다(영속 캐시가 필요할 만큼 호출량이 많지 않다).
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

declare global {
  var _marketingAiCache: Map<string, Entry<unknown>> | undefined;
}

function store(): Map<string, Entry<unknown>> {
  if (!globalThis._marketingAiCache) globalThis._marketingAiCache = new Map();
  return globalThis._marketingAiCache;
}

export function cacheKey(scope: string, input: unknown): string {
  const hash = crypto.createHash("sha1").update(JSON.stringify(input)).digest("hex").slice(0, 16);
  return `${scope}:${hash}`;
}

/**
 * 캐시에 있으면 그대로 돌려주고, 없으면 `fn()`을 실행한다.
 * `shouldCache`가 false를 반환하면 저장하지 않는다(폴백 응답 등).
 */
export async function withCache<T>(
  scope: string,
  input: unknown,
  fn: () => Promise<T>,
  shouldCache: (value: T) => boolean = () => true,
  options?: { bypass?: boolean }
): Promise<T> {
  const map = store();
  const key = cacheKey(scope, input);
  const now = Date.now();

  if (!options?.bypass) {
    const hit = map.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.value as T;
    }
    if (hit) map.delete(key);
  }

  const value = await fn();
  if (shouldCache(value)) {
    // 가장 오래된 항목부터 정리 (Map은 삽입 순서를 유지한다)
    while (map.size >= MAX_ENTRIES) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
    map.set(key, { value, expiresAt: now + TTL_MS });
  }
  return value;
}

export function invalidateAiCache(scope: string, input: unknown): void {
  const map = store();
  map.delete(cacheKey(scope, input));
}

/** 테스트용 */
export function clearAiCache(): void {
  store().clear();
}

export function aiCacheSize(): number {
  return store().size;
}
