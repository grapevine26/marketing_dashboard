import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { isManager } from "@/lib/auth/roles";
import { describeStorage, putFile, readFile, deleteFilesByPrefixes } from "@/lib/db/storage";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * 저장소 진단.
 *
 * 배포에서 저장이 실패할 때 원인을 눈으로 보려고 만들었다. DB(Supabase)가 응답하는지,
 * 파일 저장소는 어떤 백엔드인지, 실제 파일 쓰기/읽기가 되는지 알려준다.
 * 키 값이나 DB 내용은 절대 담지 않는다. 행 개수만 센다.
 */
function describeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { name: "Unknown", message: String(err) };
}

export async function GET() {
  // 관리자(대표 관리자 포함)만 본다.
  // 담기는 값 자체는 키가 아니라 "설정이 있느냐"와 행 개수뿐이지만, 그것만으로도
  // 저장소 종류·환경변수 구성·테이블 규모가 드러난다. 일반 직원이 알 필요가 없고,
  // 가입 직후 대기 상태였다가 승인된 계정까지 다 보는 것도 과하다.
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;
  if (!isManager(auth.role)) {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 403 });
  }
  const env = {
    file: describeStorage(),
    supabase: {
      hasUrl: Boolean(process.env.SUPABASE_URL),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  };
  const checks: Record<string, unknown> = {};

  // 1. DB 연결. campaigns 행 수만 센다 (head 요청이라 본문은 받지 않는다).
  try {
    const { count, error } = await db().from("campaigns").select("id", { count: "exact", head: true });
    checks.database = error ? { ok: false, error: { name: "PostgrestError", message: error.message } } : { ok: true, campaigns: count ?? 0 };
  } catch (err) {
    checks.database = { ok: false, error: describeError(err) };
  }

  // 2. 파일 쓰기 → 읽기 → 삭제 (진단용 임시 키)
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
