import { headers } from "next/headers";

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * 인메모리 슬라이딩 윈도우 기반 요청 빈도 제한 (Rate Limiter)
 * @param key 고유 식별자 (예: `ip:apply:token`)
 * @param maxRequests 윈도우 내 최대 허용 요청 횟수 (기본값: 5회)
 * @param windowMs 윈도우 지속 시간 (밀리초, 기본값: 10분)
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 5,
  windowMs: number = 10 * 60 * 1000
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const cutoff = now - windowMs;

  const record = rateLimitStore.get(key) || { timestamps: [] };
  // 윈도우 이전의 오래된 타임스탬프 제거
  const validTimestamps = record.timestamps.filter((t) => t > cutoff);

  if (validTimestamps.length >= maxRequests) {
    const oldest = validTimestamps[0];
    const resetTime = oldest + windowMs;
    return { allowed: false, remaining: 0, resetTime };
  }

  validTimestamps.push(now);
  rateLimitStore.set(key, { timestamps: validTimestamps });

  // 메모리 정리: 레코드가 과도하게 누적될 경우 비활성 엔트리 정리
  if (rateLimitStore.size > 5000) {
    for (const [k, v] of rateLimitStore.entries()) {
      const active = v.timestamps.filter((t) => t > cutoff);
      if (active.length === 0) {
        rateLimitStore.delete(k);
      } else {
        rateLimitStore.set(k, { timestamps: active });
      }
    }
  }

  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
    resetTime: now + windowMs,
  };
}

/**
 * Next.js Server Action / Route Handler에서 클라이언트 IP 추출
 */
export async function getClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    if (forwarded) {
      const ip = forwarded.split(",")[0].trim();
      if (ip) return ip;
    }
    const realIp = headerList.get("x-real-ip");
    if (realIp) return realIp.trim();
  } catch {
    // 테스트 환경 등 headers() 컨텍스트가 없을 때 기본값 처리
  }
  return "127.0.0.1";
}

/**
 * 현재 소비된 요청 횟수를 조회 (새 타임스탬프 추가 없이 조회만)
 */
export function getRateLimitUsed(
  key: string,
  windowMs: number = 24 * 60 * 60 * 1000
): number {
  const now = Date.now();
  const cutoff = now - windowMs;
  const record = rateLimitStore.get(key);
  if (!record) return 0;
  return record.timestamps.filter((t) => t > cutoff).length;
}

/**
 * 실패 시 직전 요청 1회를 롤백 (사용자 과실이 아닌 API 오류 등에서 횟수 복구)
 */
export function rollbackRateLimit(key: string): void {
  const record = rateLimitStore.get(key);
  if (record && record.timestamps.length > 0) {
    record.timestamps.pop();
  }
}

/**
 * 테스트 격리를 위한 Rate Limit 저장소 초기화 함수
 */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}
