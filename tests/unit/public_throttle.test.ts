import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { publicLinkKey, publicSubmitKey } from "@/lib/security/throttle";

/**
 * 로그인 없이 부를 수 있는 것들에 천장이 있는가.
 *
 * 이 앱에서 토큰으로 열리는 경로는 전부 **호출할 때마다 DB 에 쓴다** — 감사 로그가 한 줄씩
 * 쌓이고, 선정 액션은 거기에 더해 광고주 웹훅까지 쏜다. 로그인 없이 무제한으로 DB 에 쓸 수
 * 있다는 뜻이라, 링크가 한 번 새면 그 하나로 무료 요금제 용량을 채워 앱 전체를 멈출 수 있다.
 * 감사 로그가 쓰레기로 차면 진짜 기록도 같이 묻힌다.
 *
 * 실제로 다섯 곳 중 한 곳(광고주 선정)과 내보내기 두 곳에 제한이 빠져 있었다. 화면마다 따로
 * 기억해야 하는 종류의 방어라 또 빠뜨리기 쉬워서, 목록으로 묶어 둔다.
 */

/** 토큰으로 열리는 진입점 전부. 새로 만들면 여기에 추가해야 테스트가 통과한다. */
const 공개진입점 = [
  "app/apply/[token]/actions.ts",
  "app/pre-survey/[token]/actions.ts",
  "app/sns-approval/[token]/actions.ts",
  "app/sns-intake/actions.ts",
  "app/applicants/[token]/actions.ts",
  "app/api/applicants/export/route.ts",
  "app/api/seeding-sheet/export/route.ts",
] as const;

/**
 * 링크 전체 상한까지 거는 곳.
 *
 * 왜 전부가 아닌가 — 링크 단위 상한은 IP 를 바꿔가며 우회하는 것을 막지만, **그 링크를 쓰는
 * 모두를 한꺼번에 막는다.** 공개 지원폼처럼 불특정 다수가 들어오는 링크에 걸면 반응이 좋은
 * 캠페인 하나가 스스로 문을 닫아버린다. 그래서 **쓰는 사람이 손에 꼽는 광고주 전용 경로**에만
 * 건다. 광고주 한 명이 1시간에 100번을 누를 일은 없고, 넘겼다면 링크가 샜다는 뜻이다.
 */
const 링크상한 = [
  "app/applicants/[token]/actions.ts",
  "app/api/applicants/export/route.ts",
  "app/api/seeding-sheet/export/route.ts",
] as const;

describe("공개 경로 횟수 제한", () => {
  it("토큰으로 열리는 경로는 전부 횟수 제한을 건다", () => {
    const 빠진곳: string[] = [];
    for (const p of 공개진입점) {
      const src = readFileSync(p, "utf8");
      const 건다 = src.includes("isThrottled") && src.includes("hitThrottle");
      if (!건다) 빠진곳.push(p);
    }
    expect(
      빠진곳,
      `로그인 없이 부를 수 있는데 천장이 없다. 호출마다 DB 에 쓰므로 링크가 새면 그대로 비용이 된다:\n${빠진곳.join("\n")}`
    ).toEqual([]);
  });

  it("광고주 전용 경로에는 링크 전체 상한도 건다", () => {
    const 빠진곳 = 링크상한.filter((p) => !readFileSync(p, "utf8").includes("publicLinkKey"));
    expect(
      빠진곳,
      `IP 별 제한만 있으면 주소를 바꿔가며 그대로 통과한다. 링크 자체에도 천장이 필요하다:\n${빠진곳.join("\n")}`
    ).toEqual([]);
  });

  it("먼저 토큰을 확인한 뒤에 센다", () => {
    // 확인보다 먼저 세면, 아무 문자열이나 토큰인 척 보낼 때마다 제한표에 새 행이 쌓인다.
    // 막으려던 것(로그인 없는 무제한 DB 쓰기)을 제한 장치 자신이 당하는 꼴이 된다.
    for (const p of 공개진입점) {
      const src = readFileSync(p, "utf8");
      const 확인 = Math.min(
        ...["ByToken", "getCampaignByToken", "getSnsAccountByToken"]
          .map((k) => src.indexOf(k))
          .filter((i) => i >= 0)
      );
      const 셈 = src.indexOf("hitThrottle(");
      expect(Number.isFinite(확인), `${p} 에서 토큰 확인 지점을 못 찾았다`).toBe(true);
      expect(확인, `${p} 는 토큰을 확인하기도 전에 횟수를 센다`).toBeLessThan(셈);
    }
  });

  it("링크 상한 키에는 IP 가 섞이지 않는다", () => {
    // 섞이면 IP 별 키와 똑같아져서 우회를 막는다는 목적 자체가 사라진다.
    const a = publicLinkKey("exportapplicants", "tok123");
    const b = publicLinkKey("exportapplicants", "tok123");
    expect(a).toBe(b);
    expect(a).not.toContain("-");
    // IP 별 키는 반대로 IP 가 달라지면 달라져야 한다.
    expect(publicSubmitKey("exportapplicants", "tok123", "1.1.1.1")).not.toBe(
      publicSubmitKey("exportapplicants", "tok123", "2.2.2.2")
    );
    // 두 키가 서로를 덮어쓰지 않아야 한다. 같은 칸을 쓰면 둘 중 하나가 무의미해진다.
    expect(a).not.toBe(publicSubmitKey("exportapplicants", "tok123", null));
  });
});

describe("프록시가 실제로 걸리는 범위", () => {
  /** proxy.ts 의 matcher 를 소스에서 뽑아 진짜 정규식으로 만든다. */
  function matcher(): RegExp {
    const src = readFileSync("proxy.ts", "utf8");
    // matcher 는 한 줄이라 개행을 넘길 필요가 없다(`s` 플래그를 쓰면 타입 타깃에 걸린다).
    const m = /"(\/\(\(\?!.*?)"/.exec(src);
    expect(m, "proxy.ts 에서 matcher 를 못 찾았다").not.toBeNull();
    // 소스의 `\\.` 를 실제 `\.` 로 되돌린다. JSON 문자열 규칙과 같다.
    return new RegExp(`^${JSON.parse(`"${m![1]!}"`) as string}$`);
  }

  it("아이콘 제외가 접두사가 아니라 끝까지 묶여 있다", () => {
    const re = matcher();
    const 걸려야한다 = (p: string) => expect(re.test(p), `${p} 는 프록시를 거쳐야 한다`).toBe(true);
    const 건너뛴다 = (p: string) => expect(re.test(p), `${p} 는 프록시를 건너뛰어야 한다`).toBe(false);

    // 실제로 있는 것들. 로그인 전에 보여야 하므로 건너뛴다.
    // (배포본 확인: <link rel="icon" href="/icon?...">, <link rel="apple-touch-icon" href="/apple-icon?...">)
    건너뛴다("/icon");
    건너뛴다("/apple-icon");
    건너뛴다("/manifest.webmanifest");
    건너뛴다("/favicon.ico");
    건너뛴다("/icon-192.png"); // 확장자 규칙이 받아낸다
    건너뛴다("/logo.png");

    // **여기가 고친 부분.** 전에는 `icon` 이 접두사라 이 주소들이 전부 프록시를 통째로
    // 건너뛰었다. 그러면 로그인 검사도 CSP 도 붙지 않는다.
    걸려야한다("/icons/secret");
    걸려야한다("/icon-preview");
    걸려야한다("/apple-icon-list");
    걸려야한다("/favicon.ico.txt");

    // 평범한 화면은 당연히 걸린다.
    걸려야한다("/");
    걸려야한다("/campaigns/abc");
    걸려야한다("/files/a.png"); // 최상위가 아니므로 확장자 규칙이 안 걸린다
  });
});

// 운영 스크립트(--prod 빗장, TLS 검증)는 tests/unit/ops_scripts.test.ts 에 모아 두었다.

describe("파일이 함께 사라지는 조작", () => {
  it("템플릿 삭제는 관리자만 할 수 있다", () => {
    // 지우면 저장소의 파일까지 사라지고 백업으로도 되살릴 수 없다.
    //
    // **교체는 일부러 여기에 넣지 않는다.** 교체도 옛 파일을 지우지만 자리는 그대로
    // 두고 내용만 바꾸는 평상 업무라, 등급을 올리면 쓰기가 불편해지는 쪽이 더 크다고
    // 판단해 직원에게 열어 뒀다. 사정은 그 액션의 주석에 적혀 있다.
    const src = readFileSync("app/(dashboard)/settings/ppt-templates/actions.ts", "utf8");
    const 시작 = src.indexOf("export async function deletePptTemplateAction");
    expect(시작, "deletePptTemplateAction 을 못 찾았다").toBeGreaterThan(-1);
    const 다음 = src.indexOf("export async function ", 시작 + 1);
    const 본문 = src.slice(시작, 다음 === -1 ? undefined : 다음);
    expect(본문, "삭제에 등급 검사가 없다").toContain("isManager(user.role)");
  });
});
