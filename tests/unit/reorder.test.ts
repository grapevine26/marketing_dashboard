import { describe, it, expect } from "vitest";
import { swapItems } from "@/lib/ui/reorder";

describe("목록 자리바꿈", () => {
  const q = (id: string) => ({ id });

  it("두 자리를 맞바꾸고 원본은 건드리지 않는다", () => {
    const list = [q("a"), q("b"), q("c")];
    const next = swapItems(list, 0, 1);
    expect(next.map((x) => x.id)).toEqual(["b", "a", "c"]);
    // 원본이 그대로여야 setState 가 이전 값과 새 값을 비교할 수 있다.
    expect(list.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(next).not.toBe(list);
  });

  it("자리가 없으면 아무것도 바꾸지 않고 받은 배열을 그대로 돌려준다", () => {
    const list = [q("a"), q("b")];
    // **출발 자리(첫 번째 인자)** 도 검사한다. 예전 코드는 옮겨 갈 자리만 봤고,
    // 출발 자리가 범위를 벗어나면 배열에 undefined 가 박혀 화면이 무너졌다.
    for (const [a, b] of [
      [-1, 0],
      [5, 0],
      [0, -1],
      [0, 5],
    ] as const) {
      const next = swapItems(list, a, b);
      expect(next).toBe(list);
      expect(next.every((x) => x !== undefined)).toBe(true);
    }
  });

  it("같은 자리끼리 바꾸면 내용이 유지된다", () => {
    const list = [q("a"), q("b")];
    expect(swapItems(list, 1, 1).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
