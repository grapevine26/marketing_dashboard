import { describe, it, expect } from "vitest";
import {
  resolveMediaMime,
  unsupportedMediaMessage,
  fileExtensionOf,
  ALLOWED_SNS_MEDIA_MIME_TYPES,
} from "@/lib/db/types";

/**
 * 휴대폰 사진첩과 파일 앱은 형식을 늘 알려주지는 않는다.
 * 확장자로 되짚지 않으면 멀쩡한 사진이 "지원하지 않는 형식"으로 거부된다.
 */
describe("업로드 파일 형식 판단", () => {
  const allowed = (mime: string) => Boolean(ALLOWED_SNS_MEDIA_MIME_TYPES[mime]);

  it("브라우저가 형식을 제대로 주면 그대로 쓴다", () => {
    expect(resolveMediaMime("사진.png", "image/png")).toBe("image/png");
    expect(resolveMediaMime("영상.mp4", "video/mp4")).toBe("video/mp4");
  });

  it("형식이 비어 있으면 확장자로 되짚는다", () => {
    expect(resolveMediaMime("IMG_20260909.png", "")).toBe("image/png");
    expect(resolveMediaMime("IMG_20260909.JPG", undefined)).toBe("image/jpeg");
    expect(allowed(resolveMediaMime("clip.MOV", ""))).toBe(true);
  });

  it("application/octet-stream 으로 와도 확장자로 되짚는다", () => {
    const mime = resolveMediaMime("IMG_1234.jpg", "application/octet-stream");
    expect(mime).toBe("image/jpeg");
    expect(allowed(mime)).toBe(true);
  });

  it("jpeg 와 jpg 를 같게 본다", () => {
    expect(resolveMediaMime("a.jpeg", "")).toBe("image/jpeg");
    expect(resolveMediaMime("a.jpg", "")).toBe("image/jpeg");
  });

  it("정말 지원하지 않는 형식은 통과시키지 않는다", () => {
    expect(allowed(resolveMediaMime("문서.pdf", ""))).toBe(false);
    expect(allowed(resolveMediaMime("사진.heic", "image/heic"))).toBe(false);
    expect(allowed(resolveMediaMime("확장자없음", ""))).toBe(false);
  });

  it("안내 문구가 무엇이 문제인지 짚어준다", () => {
    expect(unsupportedMediaMessage("IMG_0001.HEIC")).toContain("아이폰 HEIC 사진");
    expect(unsupportedMediaMessage("IMG_0001.HEIC")).toContain("JPG나 PNG로 변환");
    expect(unsupportedMediaMessage("메모.txt")).toContain("지원하지 않는 형식");
  });

  it("확장자를 대소문자 구분 없이 읽는다", () => {
    expect(fileExtensionOf("A.PNG")).toBe("png");
    expect(fileExtensionOf("이름에.점.여러개.mp4")).toBe("mp4");
    expect(fileExtensionOf("확장자없음")).toBe("");
  });
});
