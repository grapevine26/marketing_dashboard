import { describe, it, expect } from "vitest";
import { shouldRefreshAfterHidden, MIN_HIDDEN_MS } from "@/lib/ui/refreshPolicy";

/**
 * 브라우저 캐시를 1분으로 늘린 대신, 탭으로 돌아올 때 다시 불러와 최신성을 지킨다.
 * 다만 잠깐 창을 바꿨다 온 것까지 매번 다시 불러오면 낭비다. 그 경계를 고정한다.
 */
describe("탭 복귀 시 갱신 판단", () => {
  const now = 1_700_000_000_000;

  it("자리를 오래 비웠으면 다시 불러온다", () => {
    expect(shouldRefreshAfterHidden(now - 60_000, now)).toBe(true);
  });

  it("경계값에서도 다시 불러온다", () => {
    expect(shouldRefreshAfterHidden(now - MIN_HIDDEN_MS, now)).toBe(true);
  });

  it("잠깐 다른 창을 봤을 뿐이면 그냥 둔다", () => {
    expect(shouldRefreshAfterHidden(now - 3_000, now)).toBe(false);
    expect(shouldRefreshAfterHidden(now - (MIN_HIDDEN_MS - 1), now)).toBe(false);
  });

  it("숨겨진 적이 없으면 아무것도 하지 않는다", () => {
    expect(shouldRefreshAfterHidden(null, now)).toBe(false);
  });

  it("기준 시간을 직접 줄 수 있다", () => {
    expect(shouldRefreshAfterHidden(now - 5_000, now, 1_000)).toBe(true);
    expect(shouldRefreshAfterHidden(now - 5_000, now, 10_000)).toBe(false);
  });
});
