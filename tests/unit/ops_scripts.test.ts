import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { X509Certificate } from "node:crypto";

/**
 * 개발자 PC 에서 도는 운영 스크립트의 안전장치.
 *
 * 앱 코드가 아니라 CI 에서도 안 돌지만, **운영 DB 에 직접 붙는 것은 이것들뿐이다.**
 * 앱은 service_role 키로 HTTPS 를 타는데 이 스크립트들은 Postgres 연결을 그대로 연다.
 */

/** DB 에 붙는 스크립트 전부. 새로 만들면 여기에 넣어야 아래 검사가 걸린다. */
const DB스크립트 = [
  "scripts/db-migrate.mjs",
  "scripts/db-backup.mjs",
  "scripts/make-admin.mjs",
  "scripts/hide-user.mjs",
] as const;

describe("운영 스크립트 빗장", () => {
  it("계정을 바꾸는 스크립트는 쓰기 직전에 --prod 를 확인한다", () => {
    // 대상이 기본값으로 운영이라, `--test` 한 단어가 빠지면 그대로 운영을 맞춘다.
    // 읽기(조회·목록)는 그대로 두고 쓰기만 막는다.
    for (const [파일, 쓰기] of [
      ["scripts/make-admin.mjs", "update public.profiles set role = 'owner'"],
      ["scripts/hide-user.mjs", "update public.profiles set hidden"],
    ] as const) {
      const src = readFileSync(파일, "utf8");
      // 정의(`function requireProdFlag(what)`)가 아니라 **호출**을 찾는다. 호출만 백틱을 쓴다.
      const 호출 = src.indexOf("requireProdFlag(`");
      const 바꾸는곳 = src.indexOf(쓰기);
      expect(호출, `${파일} 에 빗장 호출이 없다`).toBeGreaterThan(-1);
      expect(바꾸는곳, `${파일} 에서 쓰기 지점을 못 찾았다`).toBeGreaterThan(-1);
      expect(호출, `${파일} 은 운영 여부를 확인하기 전에 이미 바꾼다`).toBeLessThan(바꾸는곳);
    }
  });

  it("옛 Blob 정리는 --test 로 면제되지 않는다", () => {
    // Blob 은 토큰이 하나뿐이라 **--test 를 붙여도 대상이 운영 Blob** 이다.
    // 그래서 여기만은 isTest 로 통과시키는 requireProdFlag 를 쓰면 안 된다.
    const src = readFileSync("scripts/db-backup.mjs", "utf8");
    const 시작 = src.indexOf("if (wantPurgeLegacy) {");
    expect(시작, "purge-legacy 블록을 못 찾았다").toBeGreaterThan(-1);
    const 빗장 = src.indexOf("!allowProd", 시작);
    const 지움 = src.indexOf("await del(", 시작);
    expect(빗장, "purge-legacy 에 --prod 확인이 없다").toBeGreaterThan(-1);
    expect(지움, "purge-legacy 에서 삭제 호출을 못 찾았다").toBeGreaterThan(-1);
    expect(빗장, "확인하기 전에 이미 지운다").toBeLessThan(지움);
    const 블록 = src.slice(시작, 지움);
    expect(블록, "purge-legacy 는 --test 로 면제되면 안 된다").not.toContain("requireProdFlag(");
  });
});

/**
 * TLS 검증.
 *
 * 전에는 네 스크립트가 모두 `rejectUnauthorized: false` 였다 — 상대가 내미는 인증서를
 * 보지 않겠다는 뜻이다. 통신은 암호화되지만 **누구와** 대화하는지 모르는 상태라,
 * 중간에 낀 쪽이 자기 인증서를 내밀면 그대로 믿고 service_role 자격증명을 넘긴다.
 * 명령은 정상적으로 성공하고 화면에는 아무 표시도 나지 않는다.
 */
describe("DB 연결 TLS 검증", () => {
  const CA = "certs/supabase-root-2021.crt";
  /** 2026-09-16 에 대시보드에서 받은 것과 실제 연결에서 관측한 루트가 같았던 지문. */
  const 지문 =
    "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";

  it("어떤 스크립트도 인증서 검증을 끄지 않는다", () => {
    const 끈곳 = DB스크립트.filter((p) => readFileSync(p, "utf8").includes("rejectUnauthorized: false"));
    expect(
      끈곳,
      `검증을 끄면 중간에 낀 쪽에게 자격증명을 그대로 넘긴다. scripts/db-ssl.mjs 의 dbSsl() 을 쓸 것:\n${끈곳.join("\n")}`
    ).toEqual([]);
  });

  it("모두 공용 설정(dbSsl)을 거쳐 붙는다", () => {
    const 안쓰는곳 = DB스크립트.filter((p) => !readFileSync(p, "utf8").includes("dbSsl()"));
    expect(안쓰는곳, `TLS 설정을 제각기 적으면 한 곳만 틀려도 조용히 약해진다:\n${안쓰는곳.join("\n")}`).toEqual([]);
  });

  it("고정한 루트 CA 가 진짜 Supabase 것이다", () => {
    expect(existsSync(CA), `${CA} 가 없다. 없으면 스크립트가 아예 연결하지 않는다(그게 맞다)`).toBe(true);
    const x = new X509Certificate(readFileSync(CA, "utf8"));
    expect(x.subject).toContain("Supabase Root 2021 CA");
    // 루트는 자기가 자기를 서명한다. 중간 인증서를 잘못 넣으면 여기서 걸린다.
    expect(x.subject, "루트가 아니다 — 중간 인증서를 넣었을 수 있다").toBe(x.issuer);
    expect(x.fingerprint256, "인증서가 바뀌었다. 대시보드에서 받은 것이 맞는지 확인할 것").toBe(지문);
  });

  it("인증서 만료가 90일 넘게 남았다", () => {
    // 만료되면 네 스크립트가 **전부** 연결에 실패한다. 그날 당황하지 않도록 미리 알린다.
    // 새로 받는 곳: 대시보드 → Project Settings → Database → SSL Configuration
    const x = new X509Certificate(readFileSync(CA, "utf8"));
    const 남은일 = Math.floor((Date.parse(x.validTo) - Date.now()) / 86_400_000);
    expect(
      남은일,
      `Supabase 루트 CA 만료가 ${남은일}일 남았다(${x.validTo}). 대시보드에서 새로 받아 ${CA} 를 교체할 것`
    ).toBeGreaterThan(90);
  });
});
