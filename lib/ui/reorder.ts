/**
 * 목록에서 두 자리의 값을 맞바꾼 **새 배열**을 돌려준다.
 * 둘 중 하나라도 자리가 없으면 아무것도 하지 않고 받은 배열을 그대로 돌려준다.
 *
 * 질문 순서를 위·아래로 옮기는 화면 네 곳(운영안 사전설문 · 사전설문 템플릿 ·
 * SNS 인입 설정 · SNS 인입 질문)이 같은 코드를 각자 갖고 있었다. 전부
 * `[next[i], next[j]] = [next[j], next[i]]` 였는데, 범위 검사가 **옮겨 갈 자리(j)만**
 * 보고 출발 자리(i)는 보지 않았다. i 가 범위를 벗어나면 배열에 undefined 가 박히고,
 * 그다음 그리기에서 질문 목록 전체가 무너진다.
 */
export function swapItems<T>(list: T[], a: number, b: number): T[] {
  const itemA = list[a];
  const itemB = list[b];
  // 값을 꺼내 보는 것이 곧 범위 검사다. 자리가 없으면 undefined 가 나온다.
  if (itemA === undefined || itemB === undefined) return list;
  const next = [...list];
  next[a] = itemB;
  next[b] = itemA;
  return next;
}
