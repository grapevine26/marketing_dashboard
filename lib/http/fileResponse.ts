import { NextResponse } from "next/server";

/**
 * 만들어진 파일을 스트림으로 내려보낸다.
 *
 * Vercel 함수는 응답 본문도 4.5MB 로 자른다. 버퍼를 통째로 돌려주면 그보다 큰 파일은
 * 내려받다가 실패한다. 스트리밍 응답에는 그 한도가 없다.
 * 15MB 템플릿으로 만든 보고서가 실제로 그 크기를 넘는다.
 */
const CHUNK_BYTES = 64 * 1024;

export function bufferToStream(buffer: Buffer, chunkSize = CHUNK_BYTES): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= buffer.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, buffer.length);
      // subarray 는 같은 메모리를 가리키므로 복사해서 넘긴다.
      controller.enqueue(new Uint8Array(buffer.subarray(offset, end)));
      offset = end;
    },
  });
}

/**
 * 첨부 파일 다운로드 응답.
 * encodedFilename 은 이미 encodeURIComponent 를 거친 값이어야 한다.
 */
export function fileDownloadResponse(
  buffer: Buffer,
  contentType: string,
  encodedFilename: string
): NextResponse {
  return new NextResponse(bufferToStream(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "no-store",
      "Content-Length": String(buffer.length),
    },
  });
}
