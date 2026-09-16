/**
 * 행 하나를 고칠 때의 낙관적 잠금.
 *
 * `optimistic-lock.ts` 는 **문서 전체를 덮어쓰는 단일 행**(운영안, 공용 템플릿)용이라
 * 없으면 insert 하는 경로가 있다. 여기는 이미 있는 행을 고치는 경우다 — 없으면 없는 것이다.
 *
 * **무엇을 막나** — 둘이 같은 칸을 고치는 경우다. 서로 다른 칸이면 화면이 달라진 칸만
 * 보내므로(`lib/ui/changedFields.ts`) 이미 안전하다. 같은 칸은 값 비교로는 풀 수 없다.
 *
 *   1. A 가 캡션을 열어 본다 (updated_at = 10:00)
 *   2. B 가 캡션을 고쳐 저장한다 (updated_at = 10:05)
 *   3. A 가 자기 캡션을 저장한다 → 기준 시각 10:00 ≠ 10:05 → **거부**
 *
 * 거부는 실패가 아니라 **알림**이다. A 의 글은 화면에 그대로 남아 있고, 무엇이 바뀌었는지
 * 보고 다시 결정할 수 있다. 조용히 덮어쓰는 것보다 언제나 낫다.
 *
 * `updated_at` 은 DB 트리거가 찍는다(마이그레이션 0008). 코드가 손으로 넣으면
 * 갱신 경로가 늘 때 빠뜨릴 수 있고, 빠뜨리면 이 잠금이 조용히 무력해진다.
 */
import { db, unwrapMaybe } from "./client";
import { ValidationError } from "./validation";

export const ROW_LOCK_CONFLICT_MESSAGE =
  "다른 사람이 먼저 저장했습니다. 최신 내용을 불러온 뒤 다시 저장해주세요.";

/** 타임스탬프를 밀리초 ISO 로 맞춘다. PostgREST 는 마이크로초까지 주므로 그대로 비교하면 어긋난다. */
function normalizeTs(v: string): string | null {
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * 기준 시각이 맞을 때만 행을 고친다.
 *
 * `expectedUpdatedAt` 이 없으면 잠그지 않는다 — 한 칸만 바꾸는 조작(상태 드롭다운 등)은
 * 덮어쓸 남의 글이 없어서 굳이 막을 이유가 없고, 막으면 오히려 쓰기 불편해진다.
 * 긴 글을 다루는 화면만 기준 시각을 보낸다.
 *
 * @returns 고친 행. 행이 없으면 null.
 * @throws {ValidationError} 그 사이 다른 사람이 저장했을 때
 */
export async function updateRowWithLock<Row>(opts: {
  table: string;
  id: string;
  values: Record<string, unknown>;
  expectedUpdatedAt?: string | null;
}): Promise<Row | null> {
  const { table, id, values } = opts;

  if (!opts.expectedUpdatedAt) {
    return unwrapMaybe(await db().from(table).update(values).eq("id", id).select("*").maybeSingle<Row>());
  }

  const expected = normalizeTs(opts.expectedUpdatedAt);
  if (!expected) {
    throw new ValidationError("저장 기준 시각이 올바르지 않습니다. 화면을 새로고침한 뒤 다시 저장해주세요.");
  }

  const current = unwrapMaybe(
    await db().from(table).select("updated_at").eq("id", id).maybeSingle<{ updated_at: string }>()
  );
  if (!current) return null;
  if (normalizeTs(current.updated_at) !== expected) throw new ValidationError(ROW_LOCK_CONFLICT_MESSAGE);

  // 읽은 뒤 고치기까지의 틈에 다른 저장이 끼어들 수 있다. 원본 값으로 조건을 한 번 더 건다.
  // 조건에는 화면이 보낸 문자열이 아니라 **방금 읽은 원본**을 쓴다 — 정밀도가 어긋나지 않는다.
  const row = unwrapMaybe(
    await db()
      .from(table)
      .update(values)
      .eq("id", id)
      .eq("updated_at", current.updated_at)
      .select("*")
      .maybeSingle<Row>()
  );
  if (!row) throw new ValidationError(ROW_LOCK_CONFLICT_MESSAGE);
  return row;
}

/** 행의 현재 기준 시각. 화면이 편집을 시작할 때 받아 두었다가 저장할 때 돌려보낸다. */
export async function readRowUpdatedAt(table: string, id: string): Promise<string | null> {
  const row = unwrapMaybe(
    await db().from(table).select("updated_at").eq("id", id).maybeSingle<{ updated_at: string }>()
  );
  return row?.updated_at ?? null;
}
