import { NextResponse } from "next/server";
import { runBackup, listBackupFiles } from "@/lib/db/backup";

export const dynamic = "force-dynamic";
// 행이 많아지면 오래 걸릴 수 있다. Fluid Compute 기본 상한 안이다.
export const maxDuration = 300;

/**
 * 매일 DB 전체를 저장소에 백업한다. Vercel 크론이 부른다 (vercel.json 의 crons).
 *
 * 이 엔드포인트는 DB 전체를 읽는다. 아무나 부르면 데이터가 통째로 새므로 반드시 막아야 한다.
 * CRON_SECRET 이 없으면 아예 동작하지 않는다(열어두지 않는다). Vercel 은 크론 요청에
 * `Authorization: Bearer <CRON_SECRET>` 을 붙여 보낸다.
 */
function authorize(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // 설정이 빠졌을 때 열어두면 안 된다. 막고 알린다.
    console.error("[cron/backup] CRON_SECRET 이 없습니다. 백업 엔드포인트를 막습니다.");
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET 이 설정되지 않아 실행할 수 없습니다." },
      { status: 503 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  const startedAt = Date.now();
  try {
    const result = await runBackup();
    const total = (await listBackupFiles()).length;
    console.log(
      `[cron/backup] ${result.key} 저장 완료 — ${result.rows}행, ${result.bytes}바이트, 보관 ${total}개` +
        (result.removed.length ? `, 정리 ${result.removed.length}개` : "")
    );
    return NextResponse.json({
      ok: true,
      key: result.key,
      rows: result.rows,
      bytes: result.bytes,
      counts: result.counts,
      kept: total,
      removed: result.removed,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/backup] 백업 실패:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
