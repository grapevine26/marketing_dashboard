/**
 * 폼을 열었을 때의 값과 달라진 칸만 골라낸다.
 *
 * **왜 필요한가** — 여러 칸짜리 폼이 저장할 때마다 **모든 칸을 함께 보내고 있었다.**
 * 그 값들은 폼을 연 순간의 스냅샷이라, 그 사이 남이 다른 칸을 고쳤으면 옛 값으로 덮어쓴다.
 *
 *   1. A 가 콘텐츠 편집을 연다 (캡션 = "원본")
 *   2. B 가 같은 콘텐츠의 캡션을 "B 가 쓴 카피" 로 바꾸고 저장한다
 *   3. A 가 제목만 고치고 저장한다 → 캡션 = "원본" 도 함께 전송
 *   4. **B 의 작업이 조용히 사라진다.** A 는 자기가 무엇을 지웠는지 모른다.
 *
 * 안 건드린 칸을 아예 안 보내면 이 사고가 없어진다. DB 쪽 갱신 함수들은 이미
 * "undefined 는 건드리지 않음" 규칙을 지키므로, 보내지 않은 칸은 남의 값 그대로 남는다.
 *
 * **이것으로 못 막는 것** — 둘이 **같은 칸**을 고치면 여전히 나중 저장이 이긴다.
 * 그건 값을 비교하는 것으로는 풀 수 없고 낙관적 잠금(updated_at 대조)이 있어야 한다.
 * 운영안·템플릿처럼 글이 긴 곳에는 이미 걸려 있다(`lib/db/optimistic-lock.ts`).
 */
export function changedFields<T extends object>(열었을때: T, 지금: T): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of Object.keys(지금) as (keyof T)[]) {
    // 값 비교는 얕게 한다. 이 유틸이 다루는 폼은 문자열·숫자·null 뿐이다.
    // 객체나 배열을 담은 폼에 쓰면 매번 "달라졌다" 가 되므로 그때는 쓰지 말 것.
    if (!Object.is(열었을때[key], 지금[key])) patch[key] = 지금[key];
  }
  return patch;
}

/** 바뀐 칸이 하나도 없는가. 저장 요청 자체를 건너뛸 때 쓴다. */
export function nothingChanged(patch: object): boolean {
  return Object.keys(patch).length === 0;
}
