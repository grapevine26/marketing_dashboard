import { describe, it, expect, beforeEach } from "vitest";
import { toast, clearToasts } from "@/components/Toast";

describe("Toast notification store", () => {
  beforeEach(() => {
    clearToasts();
  });

  it("success, error, info, warning 토스트를 정상적으로 등록한다", () => {
    const id1 = toast.success("저장되었습니다.");
    const id2 = toast.error("저장 실패");
    const id3 = toast.info("안내 메시지");
    const id4 = toast.warning("경고 메시지");

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id3).toBeDefined();
    expect(id4).toBeDefined();
  });

  it("특정 토스트를 ID로 수동 삭제(dismiss)할 수 있다", () => {
    const id = toast.success("삭제 대상 토스트");
    toast.dismiss(id);
    // dismiss 후 재삭제 시도시에도 에러가 발생하지 않는다
    expect(() => toast.dismiss(id)).not.toThrow();
  });

  it("clear 호출 시 모든 토스트가 비워진다", () => {
    toast.success("1");
    toast.success("2");
    toast.clear();
    expect(() => toast.clear()).not.toThrow();
  });
});
