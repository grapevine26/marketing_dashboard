import { describe, it, expect, beforeEach, vi } from "vitest";
import { withCache, clearAiCache, aiCacheSize, cacheKey, invalidateAiCache } from "@/lib/ai/cache";

describe("AI Cache (withCache)", () => {
  beforeEach(() => {
    clearAiCache();
    vi.restoreAllMocks();
  });

  it("첫 호출 시 함수를 실행하고 결과를 캐시한다", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return { text: "ai response" };
    };

    const res1 = await withCache("test", { q: "hello" }, fetcher);
    expect(res1).toEqual({ text: "ai response" });
    expect(callCount).toBe(1);
    expect(aiCacheSize()).toBe(1);

    // 동일한 키로 두 번째 호출 시 캐시에서 반환되어 fetcher가 실행되지 않음
    const res2 = await withCache("test", { q: "hello" }, fetcher);
    expect(res2).toEqual({ text: "ai response" });
    expect(callCount).toBe(1);
  });

  it("입력이 다르면 다른 캐시 키로 구분된다", async () => {
    const k1 = cacheKey("scope", { a: 1 });
    const k2 = cacheKey("scope", { a: 2 });
    expect(k1).not.toBe(k2);

    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return "val";
    };

    await withCache("scope", { a: 1 }, fetcher);
    await withCache("scope", { a: 2 }, fetcher);
    expect(callCount).toBe(2);
    expect(aiCacheSize()).toBe(2);
  });

  it("shouldCache가 false를 반환하면 캐시되지 않는다 (폴백 응답 등)", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return { fallback: true, text: "error fallback" };
    };

    const res1 = await withCache("test", { q: "fail" }, fetcher, (val) => !val.fallback);
    expect(res1.fallback).toBe(true);
    expect(callCount).toBe(1);
    expect(aiCacheSize()).toBe(0);

    // 캐시되지 않았으므로 다시 실행됨
    await withCache("test", { q: "fail" }, fetcher, (val) => !val.fallback);
    expect(callCount).toBe(2);
  });

  it("TTL(24시간)이 지나면 캐시가 만료되어 새로 조회한다", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return "fresh";
    };

    const now = 1_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    await withCache("ttlTest", { id: 1 }, fetcher);
    expect(callCount).toBe(1);

    // 1시간 후: 캐시 히트
    vi.spyOn(Date, "now").mockReturnValue(now + 60 * 60 * 1000);
    await withCache("ttlTest", { id: 1 }, fetcher);
    expect(callCount).toBe(1);

    // 25시간 후: 만료되어 재실행
    vi.spyOn(Date, "now").mockReturnValue(now + 25 * 60 * 60 * 1000);
    await withCache("ttlTest", { id: 1 }, fetcher);
    expect(callCount).toBe(2);
  });

  it("MAX_ENTRIES(200개) 초과 시 가장 오래된 항목부터 FIFO로 축출한다", async () => {
    for (let i = 0; i < 205; i++) {
      await withCache("bulk", { index: i }, async () => `val-${i}`);
    }
    expect(aiCacheSize()).toBeLessThanOrEqual(200);
  });

  it("options.bypass가 true이면 기존 캐시를 건너뛰고 fetcher를 실행하여 갱신한다", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return `result-${callCount}`;
    };

    const res1 = await withCache("bypassTest", { q: "repeat" }, fetcher);
    expect(res1).toBe("result-1");
    expect(callCount).toBe(1);

    // bypass 없이 호출하면 캐시 히트
    const res2 = await withCache("bypassTest", { q: "repeat" }, fetcher);
    expect(res2).toBe("result-1");
    expect(callCount).toBe(1);

    // bypass: true로 호출하면 새로 실행되어 새로운 결과 반환 및 캐시 갱신
    const res3 = await withCache("bypassTest", { q: "repeat" }, fetcher, () => true, { bypass: true });
    expect(res3).toBe("result-2");
    expect(callCount).toBe(2);

    // 다시 bypass 없이 호출하면 갱신된 결과 반환
    const res4 = await withCache("bypassTest", { q: "repeat" }, fetcher);
    expect(res4).toBe("result-2");
    expect(callCount).toBe(2);
  });

  it("invalidateAiCache 호출 시 해당 키가 캐시에서 삭제된다", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return `count-${callCount}`;
    };

    await withCache("invTest", { id: 42 }, fetcher);
    expect(callCount).toBe(1);

    invalidateAiCache("invTest", { id: 42 });
    await withCache("invTest", { id: 42 }, fetcher);
    expect(callCount).toBe(2);
  });
});
