import { describe, it, expect } from "vitest";
import { bufferToStream, fileDownloadResponse } from "@/lib/http/fileResponse";

async function drain(stream: ReadableStream<Uint8Array>): Promise<{ bytes: Buffer; chunks: number }> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let chunks = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    chunks++;
  }
  return { bytes: Buffer.concat(parts), chunks };
}

/**
 * 만든 파일은 스트림으로 내려보내야 한다.
 * 버퍼를 통째로 돌려주면 Vercel 함수의 4.5MB 응답 한도에 걸려 큰 파일은 받다가 실패한다.
 */
describe("파일 다운로드 스트리밍", () => {
  it("내용이 한 바이트도 바뀌지 않는다", async () => {
    const src = Buffer.from("한글과 ASCII 가 섞인 내용".repeat(500), "utf-8");
    const { bytes } = await drain(bufferToStream(src));
    expect(bytes.equals(src)).toBe(true);
  });

  it("한 번에 다 밀지 않고 조각으로 나눠 보낸다", async () => {
    const src = Buffer.alloc(5 * 64 * 1024 + 123, 0x41);
    const { bytes, chunks } = await drain(bufferToStream(src));
    expect(bytes.length).toBe(src.length);
    expect(chunks).toBe(6);
  });

  it("빈 파일도 오류 없이 닫힌다", async () => {
    const { bytes, chunks } = await drain(bufferToStream(Buffer.alloc(0)));
    expect(bytes.length).toBe(0);
    expect(chunks).toBe(0);
  });

  it("응답이 스트림이고 헤더가 붙는다", async () => {
    const src = Buffer.from("보고서 내용", "utf-8");
    const res = fileDownloadResponse(src, "application/pdf", encodeURIComponent("결과보고서.pdf"));

    expect(res.body).toBeInstanceOf(ReadableStream);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe(String(src.length));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toContain("attachment; filename*=UTF-8''");

    const back = Buffer.from(await new Response(res.body).arrayBuffer());
    expect(back.equals(src)).toBe(true);
  });

  it("4.5MB 를 넘는 파일도 그대로 통과한다", async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 0x42);
    const { bytes } = await drain(bufferToStream(big));
    expect(bytes.length).toBe(big.length);
  });
});
