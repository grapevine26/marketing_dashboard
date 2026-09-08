/**
 * 탭으로 돌아왔을 때 화면을 다시 불러올지 정한다.
 *
 * 잠깐 다른 창을 봤다가 온 것까지 매번 다시 불러오면 낭비다.
 * 자리를 비운 시간이 이 값을 넘었을 때만 새로 받는다.
 */
export const MIN_HIDDEN_MS = 15_000;

export function shouldRefreshAfterHidden(
  hiddenAt: number | null,
  now: number,
  minHiddenMs: number = MIN_HIDDEN_MS
): boolean {
  if (hiddenAt === null) return false;
  return now - hiddenAt >= minHiddenMs;
}
