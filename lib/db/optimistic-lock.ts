/**
 * 문서 전체를 덮어쓰는 단일 행(행사 운영안, SNS 제안서)의 낙관적 잠금.
 *
 * 두 사람이 같은 문서를 열어 놓고 차례로 저장하면, 뒤에 저장한 쪽이 앞사람의 변경을 모르고
 * 통째로 덮어쓴다. 이를 막으려고 화면이 불러올 때 받은 `updated_at` 을 저장할 때 함께 보내고,
 * DB 의 값이 그대로일 때만 update 한다. 0행이면 다른 사람이 먼저 저장한 것이다.
 *
 * - 행이 아직 없으면(첫 저장) insert 한다.
 * - **행이 이미 있는데 `expectedUpdatedAt` 이 없으면 거부한다.** 전에는 하위 호환이라며 그냥
 *   덮어쓰게 두었는데, 운영안이 아직 없는 행사를 둘이 같이 열면 양쪽 다 기준 시각이 비어 있어
 *   뒤에 저장한 사람이 앞사람 것을 조용히 지웠다. 옛 화면은 존재하지 않으므로 지킬 것이 없다.
 * - 조건은 화면이 보낸 문자열이 아니라 방금 읽은 행의 원본 `updated_at` 으로 건다.
 *   PostgREST 가 돌려준 문자열을 그대로 되돌려 보내야 정밀도(마이크로초)가 어긋나지 않는다.
 *   화면 값과의 비교는 JS 에서 밀리초 단위로 정규화해서 한다.
 */
import { db, unwrap, unwrapMaybe } from "./client";
import { ValidationError, nowIso } from "./validation";

export const OPTIMISTIC_LOCK_CONFLICT_MESSAGE =
  "다른 사람이 먼저 저장했습니다. 화면을 새로고침한 뒤 다시 저장해주세요.";

/** 타임스탬프 문자열을 밀리초 ISO 로 맞춘다. 형식이 아니면 null. */
function normalizeTs(v: string): string | null {
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function writeWithOptimisticLock<Row extends { updated_at: string }>(opts: {
  table: string;
  /** 문서를 하나로 특정하는 unique 컬럼(event_id, account_id). */
  keyColumn: string;
  keyValue: string;
  /** updated_at 을 제외한 저장 값. insert 와 update 에 같이 쓴다. */
  values: Record<string, unknown>;
  expectedUpdatedAt?: string | null;
}): Promise<Row> {
  const { table, keyColumn, keyValue, values } = opts;

  const existing = unwrapMaybe(
    await db()
      .from(table)
      .select("updated_at")
      .eq(keyColumn, keyValue)
      .maybeSingle<{ updated_at: string }>()
  );

  // 첫 저장. 동시에 둘이 처음 저장하면 unique 위반이 나는데, 그것도 "먼저 저장한 사람이 있다" 는 뜻이다.
  if (!existing) {
    const res = await db()
      .from(table)
      .insert({ ...values, updated_at: nowIso() })
      .select("*")
      .single<Row>();
    if (res.error?.code === "23505") throw new ValidationError(OPTIMISTIC_LOCK_CONFLICT_MESSAGE);
    return unwrap(res);
  }

  const expected = opts.expectedUpdatedAt ? normalizeTs(opts.expectedUpdatedAt) : null;
  // 행이 이미 있는데 기준 시각이 없다 = 이 화면은 문서가 없던 시절에 열렸다는 뜻이다.
  // 그 사이 누군가 처음 저장했으므로 덮어쓰면 안 된다.
  if (!expected) throw new ValidationError(OPTIMISTIC_LOCK_CONFLICT_MESSAGE);
  if (opts.expectedUpdatedAt && !expected) {
    throw new ValidationError("저장 기준 시각이 올바르지 않습니다. 화면을 새로고침한 뒤 다시 저장해주세요.");
  }
  if (expected && expected !== normalizeTs(existing.updated_at)) {
    throw new ValidationError(OPTIMISTIC_LOCK_CONFLICT_MESSAGE);
  }

  let query = db()
    .from(table)
    .update({ ...values, updated_at: nowIso() })
    .eq(keyColumn, keyValue);
  // 읽은 뒤 update 하기까지의 틈에 다른 저장이 끼어들 수 있다. 원본 값으로 한 번 더 조건을 건다.
  if (expected) query = query.eq("updated_at", existing.updated_at);

  const row = unwrapMaybe(await query.select("*").maybeSingle<Row>());
  if (!row) throw new ValidationError(OPTIMISTIC_LOCK_CONFLICT_MESSAGE);
  return row;
}
