/**
 * 한국어 조사를 앞말에 맞춰 고른다.
 *
 * **왜 필요한가** — 지금 화면 곳곳에 `"지원자 명단을(를) 내려받았습니다"`,
 * `"[예비선정](으)로 변경했습니다"` 처럼 괄호가 그대로 나간다. 감사 로그·토스트·오류 문구·
 * 확인 대화상자까지 매일 보는 자리라, 쌓이면 제품이 덜 만들어진 것처럼 보인다.
 *
 * 조사는 **앞말의 받침 유무**로 정해지고 규칙이 분명해서 사람이 고를 필요가 없다.
 *
 * ```ts
 * `${label}${josa(label, "을")} 입력해주세요.`        // 이름을 / 주소를
 * `[${status}]${josa(status, "로")} 변경했습니다.`     // [예비선정]으로 / [게시완료]로
 * ```
 *
 * **괄호·따옴표는 건너뛴다.** 화면 문구는 `[예비선정]` 처럼 값을 감싸는 일이 많은데,
 * 읽는 사람은 `]` 가 아니라 `정` 을 기준으로 조사를 고른다. 그래서 뒤쪽 기호를 떼고 본다.
 */

/** 받침이 있는 글자 뒤에 오는 형태와 없는 글자 뒤에 오는 형태. */
const 조사표 = {
  을: ["을", "를"],
  이: ["이", "가"],
  은: ["은", "는"],
  와: ["과", "와"],
  /** `로` 는 예외다 — **ㄹ 받침 뒤에서는 "으로" 가 아니라 "로"** 다(서울로, 게시완료로). */
  로: ["으로", "로"],
} as const;

export type JosaKind = keyof typeof 조사표;

/** 조사를 정할 수 없을 때 쓰는 표기. 지금까지 화면에 나가던 모습 그대로다. */
const 모를때 = {
  을: "을(를)",
  이: "이(가)",
  은: "은(는)",
  와: "와(과)",
  로: "(으)로",
} as const;

/** 숫자는 소리 나는 대로 판단한다. 0 은 "영", 1 은 "일". */
const 숫자받침: Record<string, boolean> = {
  "0": true, // 영 — ㅇ
  "1": true, // 일 — ㄹ
  "2": false, // 이
  "3": true, // 삼 — ㅁ
  "4": false, // 사
  "5": false, // 오
  "6": true, // 육 — ㄱ
  "7": true, // 칠 — ㄹ
  "8": true, // 팔 — ㄹ
  "9": false, // 구
};

/** 알파벳도 한국에서 읽는 이름 기준이다. 엘·엠·엔·알만 받침이 있다. */
const 알파벳받침: Record<string, boolean> = {
  l: true, // 엘
  m: true, // 엠
  n: true, // 엔
  r: true, // 알
};

/** ㄹ 받침인지. `로` 를 고를 때만 쓴다. */
const RIEUL_INDEX = 8;

interface 받침정보 {
  있음: boolean;
  리을: boolean;
}

/**
 * 조사를 고르는 기준이 될 마지막 글자의 받침 정보. 알 수 없으면 null.
 *
 * 뒤에 붙은 기호(`]`, `)`, `"`, 공백 등)는 소리가 나지 않으므로 떼고 본다.
 */
function 받침보기(word: string): 받침정보 | null {
  const 정리 = word.replace(/[\s\]\)"'”’』」》>.\-_]+$/u, "");
  const last = [...정리].at(-1);
  if (!last) return null;

  const code = last.charCodeAt(0);
  // 한글 음절(가 ~ 힣). 종성 인덱스가 0 이면 받침이 없다.
  if (code >= 0xac00 && code <= 0xd7a3) {
    const 종성 = (code - 0xac00) % 28;
    return { 있음: 종성 !== 0, 리을: 종성 === RIEUL_INDEX };
  }
  if (last in 숫자받침) {
    const 있음 = 숫자받침[last]!;
    // 1·7·8 은 일·칠·팔 이라 ㄹ 받침이다.
    return { 있음, 리을: last === "1" || last === "7" || last === "8" };
  }
  const 소문자 = last.toLowerCase();
  if (/^[a-z]$/.test(소문자)) {
    const 있음 = 알파벳받침[소문자] ?? false;
    return { 있음, 리을: 소문자 === "l" || 소문자 === "r" };
  }
  // 한글·숫자·알파벳이 아니면(이모지, 한자, 기호…) 소리를 알 수 없다.
  return null;
}

/**
 * 앞말에 맞는 조사를 돌려준다.
 *
 * @param word 조사 **앞에 오는 말**. 괄호로 감싼 문구라면 감싼 채 넘겨도 된다.
 * @param kind 받침 있는 쪽 형태로 적는다(`을`, `이`, `은`, `와`, `로`).
 * @returns 고른 조사. 판단할 수 없으면 `을(를)` 같은 기존 표기를 그대로 돌려준다.
 */
export function josa(word: string, kind: JosaKind): string {
  const 정보 = 받침보기(word ?? "");
  if (!정보) return 모를때[kind];
  const [받침있을때, 받침없을때] = 조사표[kind];
  // `로` 만 예외 — ㄹ 받침은 받침이 없는 것처럼 "로" 를 쓴다.
  if (kind === "로" && 정보.리을) return 받침없을때;
  return 정보.있음 ? 받침있을때 : 받침없을때;
}

/** 앞말과 조사를 붙여서 돌려준다. `${x}${josa(x, "을")}` 을 짧게 쓰는 용도. */
export function withJosa(word: string, kind: JosaKind): string {
  return `${word}${josa(word, kind)}`;
}
