import { NextResponse } from "next/server";
import {
  describeStorage,
  readDoc,
  putFile,
  readFile,
  deleteFilesByPrefixes,
  probeConditionalWrite,
  probeDocConditionalWrite,
} from "@/lib/db/storage";

export const dynamic = "force-dynamic";

/**
 * 저장소 진단.
 *
 * 배포에서 저장이 실패할 때 원인을 눈으로 보려고 만들었다. 어떤 백엔드를 쓰는지,
 * 어떤 환경 변수가 있는지(값이 아니라 있는지 여부만), 실제 읽기/쓰기가 되는지 알려준다.
 * 토큰 값이나 DB 내용은 절대 담지 않는다.
 */
function describeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { name: "Unknown", message: String(err) };
}

export async function GET(request: Request) {
  const env = describeStorage();
  const checks: Record<string, unknown> = {};

  // 1. 문서 읽기. 내용은 담지 않고 레코드 개수만 센다.
  try {
    const snap = await readDoc();
    if (!snap) {
      checks.readDoc = { ok: true, empty: true, note: "아직 저장된 DB 문서가 없습니다. 첫 저장 때 만들어집니다." };
    } else {
      let counts: Record<string, number> | { parseError: string } ;
      try {
        const parsed = JSON.parse(snap.text) as Record<string, unknown>;
        counts = Object.fromEntries(
          Object.entries(parsed)
            .filter(([, v]) => Array.isArray(v))
            .map(([k, v]) => [k, (v as unknown[]).length])
        );
      } catch (err) {
        counts = { parseError: describeError(err).message };
      }
      checks.readDoc = { ok: true, bytes: snap.text.length, hasVersion: snap.version !== null, counts };
    }
  } catch (err) {
    checks.readDoc = { ok: false, error: describeError(err) };
  }

  // 2. 조건부 쓰기(낙관적 잠금). 저장이 실패하는 원인이 대부분 여기다.
  try {
    const probe = await probeConditionalWrite();
    checks.conditionalWrite = probe;
  } catch (err) {
    checks.conditionalWrite = { ok: false, error: describeError(err) };
  }

  // 2-b. 같은 검사를 진짜 DB 문서에 대고 한 번 더.
  // 내용은 바뀌지 않지만 쓰기는 쓰기다. 요청할 때만 돈다: ?probeWrite=1
  if (new URL(request.url).searchParams.get("probeWrite") === "1") {
    try {
      checks.conditionalWriteOnRealDoc = await probeDocConditionalWrite();
    } catch (err) {
      checks.conditionalWriteOnRealDoc = { ok: false, error: describeError(err) };
    }
  } else {
    checks.conditionalWriteOnRealDoc = { skipped: "?probeWrite=1 을 붙이면 실제 문서에 대고 검사한다" };
  }

  // 3. 파일 쓰기 → 읽기 → 삭제 (진단용 임시 키)
  const probeId = `healthcheck-${Date.now()}`;
  try {
    const body = Buffer.from("ok");
    await putFile(`${probeId}.txt`, body, "text/plain");
    const back = await readFile(`${probeId}.txt`);
    const text = back ? Buffer.from(await new Response(back.stream).arrayBuffer()).toString() : null;
    checks.fileRoundTrip = { ok: text === "ok", readBack: text };
  } catch (err) {
    checks.fileRoundTrip = { ok: false, error: describeError(err) };
  } finally {
    try {
      await deleteFilesByPrefixes([probeId]);
    } catch {
      /* 진단 파일 정리 실패는 무시한다 */
    }
  }

  const healthy = Object.values(checks).every((c) => (c as { ok?: boolean }).ok !== false);
  return NextResponse.json({ healthy, env, checks }, { status: healthy ? 200 : 500 });
}
