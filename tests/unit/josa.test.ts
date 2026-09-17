import { describe, it, expect } from "vitest";
import { josa, withJosa } from "@/lib/ui/josa";

/**
 * 조사는 앞말의 받침으로 정해지고 규칙이 분명하다. 사람이 고를 필요가 없는데도
 * 화면 곳곳에 `"지원자 명단을(를)"`, `"[예비선정](으)로"` 가 그대로 나가고 있었다.
 */
describe("조사 고르기", () => {
  it("받침이 있으면 을/이/은/과/으로", () => {
    expect(josa("이름", "을")).toBe("을"); // ㅁ
    expect(josa("이름", "이")).toBe("이");
    expect(josa("이름", "은")).toBe("은");
    expect(josa("이름", "와")).toBe("과");
    expect(josa("이름", "로")).toBe("으로");
  });

  it("받침이 없으면 를/가/는/와/로", () => {
    expect(josa("주소", "을")).toBe("를");
    expect(josa("주소", "이")).toBe("가");
    expect(josa("주소", "은")).toBe("는");
    expect(josa("주소", "와")).toBe("와");
    expect(josa("주소", "로")).toBe("로");
  });

  it("ㄹ 받침 뒤에서는 '으로' 가 아니라 '로' 다", () => {
    // 서울로, 게시완료로. 이 예외를 빠뜨리면 "서울으로" 가 된다.
    expect(josa("서울", "로")).toBe("로");
    expect(josa("게시완료", "로")).toBe("로"); // 료 — ㄹ 아님(받침 없음)
    expect(josa("말", "로")).toBe("로");
    // 다른 조사에서는 ㄹ 도 평범한 받침이다.
    expect(josa("서울", "을")).toBe("을");
  });

  it("값을 감싼 괄호·따옴표는 건너뛰고 앞말로 판단한다", () => {
    // 화면 문구는 `[예비선정]` 처럼 값을 감싸는 일이 많은데, 읽는 사람은 `]` 가 아니라
    // `정` 을 기준으로 조사를 고른다.
    expect(josa("[예비선정]", "로")).toBe("으로");
    expect(josa("[최종선정]", "을")).toBe("을");
    expect(josa('"홍길동"', "이")).toBe("이");
    expect(josa("(주소)", "은")).toBe("는");
    expect(josa("이름 ", "을")).toBe("을");
  });

  it("숫자와 알파벳도 소리 나는 대로 고른다", () => {
    expect(josa("1", "이")).toBe("이"); // 일
    expect(josa("2", "이")).toBe("가"); // 이
    expect(josa("3", "이")).toBe("이"); // 삼
    expect(josa("6", "을")).toBe("을"); // 육
    expect(josa("0", "을")).toBe("을"); // 영
    expect(josa("1", "로")).toBe("로"); // 일 — ㄹ 받침
    expect(josa("CSV", "을")).toBe("를"); // 브이
    expect(josa("Excel", "을")).toBe("을"); // 엘
  });

  it("소리를 알 수 없으면 지금까지 쓰던 표기를 그대로 준다", () => {
    // 이모지나 한자로 끝나는 이름이면 받침을 알 수 없다. 틀린 조사를 찍는 것보다
    // 괄호 표기가 낫다 — 적어도 읽는 사람이 스스로 고를 수 있다.
    expect(josa("🙂", "을")).toBe("을(를)");
    expect(josa("", "로")).toBe("(으)로");
    expect(josa("金", "이")).toBe("이(가)");
  });

  it("withJosa 는 앞말과 붙여서 준다", () => {
    expect(withJosa("이름", "을")).toBe("이름을");
    expect(withJosa("주소", "을")).toBe("주소를");
  });

  it("실제 화면 문구가 제대로 만들어진다", () => {
    const 라벨 = (l: string) => `${l}${josa(l, "을")} 입력해주세요.`;
    expect(라벨("성함")).toBe("성함을 입력해주세요.");
    expect(라벨("활동 SNS 계정 URL")).toBe("활동 SNS 계정 URL을 입력해주세요."); // 엘

    const 상태 = (s: string) => `[${s}]${josa(s, "로")} 변경했습니다.`;
    expect(상태("예비선정")).toBe("[예비선정]으로 변경했습니다.");
    expect(상태("게시완료")).toBe("[게시완료]로 변경했습니다.");

    const 내려받기 = (w: string) => `광고주가 공유 링크로 ${w}${josa(w, "을")} 내려받았습니다.`;
    expect(내려받기("지원자 명단")).toBe("광고주가 공유 링크로 지원자 명단을 내려받았습니다.");
    expect(내려받기("배송/방문 관리시트")).toBe("광고주가 공유 링크로 배송/방문 관리시트를 내려받았습니다.");
  });
});
