/**
 * 운영·테스트 DB 에 붙을 때 쓸 TLS 설정.
 *
 * **무엇을 막는가** — 중간에 끼어든 쪽에게 자격증명을 넘기는 것.
 *
 * 전에는 네 스크립트가 모두 `ssl: { rejectUnauthorized: false }` 였다. 그건 "상대가
 * 내미는 신분증을 보지 않겠다" 는 뜻이다. 통신은 암호화되지만 **누구와** 암호화해 대화하는지는
 * 모르는 상태라, 중간에 낀 쪽이 자기 인증서를 내밀면 그대로 믿고 연결한다. 그 연결로
 * service_role 자격증명과 DB 전체가 흐른다. 명령은 정상적으로 성공하고 화면에는 아무 표시도
 * 나지 않는다.
 *
 * **왜 그냥 켜지지 않았나** — Supabase 는 공용 CA 를 쓰지 않고 자체 PKI 를 쓴다.
 *
 *   *.pooler.supabase.com  ←  Supabase Intermediate 2021 CA  ←  Supabase Root 2021 CA
 *
 * 이 발급기관이 윈도우·Node 의 기본 신뢰 목록에 없어서, 검증만 켜면
 * `self-signed certificate in certificate chain` 으로 거부된다. 그래서 루트 CA 를 직접 준다.
 *
 * **인증서 출처** — Supabase 대시보드 → Project Settings → Database → SSL Configuration →
 * Download certificate (파일명 prod-ca-2021.crt). 내려받은 것과 실제 연결에서 관측한 루트의
 * SHA-256 지문이 같은 것을 확인하고 넣었다(2026-09-16):
 *
 *   80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
 *
 * 공개된 CA 인증서이므로 저장소에 두어도 된다. 비밀이 아니다.
 *
 * **2031-04-26 에 만료된다.** 그때가 되면 대시보드에서 새 인증서를 받아 이 파일을 갈아야 한다.
 * 잊지 않도록 tests/unit/public_throttle.test.ts 가 만료 임박을 미리 알려준다.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const 여기 = path.dirname(fileURLToPath(import.meta.url));

/** 저장소에 넣어 둔 Supabase 루트 CA. */
export const CA_PATH = path.join(여기, "..", "certs", "supabase-root-2021.crt");

/**
 * pg.Client 에 넘길 ssl 설정.
 *
 * 인증서가 없으면 **연결하지 않고 멈춘다.** 여기서 `rejectUnauthorized: false` 로 슬쩍
 * 되돌아가면, 파일이 사라진 줄도 모른 채 검증 없는 연결을 계속 쓰게 된다. 조용히 약해지는
 * 방어는 없는 것보다 나쁘다 — 있다고 믿게 만들기 때문이다.
 */
export function dbSsl() {
  if (!fs.existsSync(CA_PATH)) {
    console.error("");
    console.error("Supabase 루트 CA 를 찾을 수 없습니다:");
    console.error(`  ${CA_PATH}`);
    console.error("");
    console.error("대시보드에서 다시 받아 그 자리에 두세요.");
    console.error("  Project Settings → Database → SSL Configuration → Download certificate");
    console.error("  받은 prod-ca-2021.crt 를 certs/supabase-root-2021.crt 로 저장");
    process.exit(1);
  }
  return { ca: fs.readFileSync(CA_PATH, "utf8"), rejectUnauthorized: true };
}
