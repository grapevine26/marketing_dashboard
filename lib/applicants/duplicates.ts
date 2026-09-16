import { Applicant } from "@/lib/db/types";

/**
 * 중복 지원 감지. 지원자 id -> 사유 목록.
 *
 * **광고주에게는 연락처 사유를 보내지 않는다(`includeContact: false`).**
 * 연락처 값 자체는 무해화가 비워서 내보내는데, 거기서 파생된 "이 둘이 같은 번호를 썼다" 는
 * 사실이 사유 문자열에 그대로 남아 있었다. 가족·지인이 각자 계정으로 지원한 정상적인 경우까지
 * 관계가 드러난다. 그 판단은 대행사가 할 일이지 광고주가 알 일이 아니다.
 *
 * SNS 계정 중복은 광고주에게도 보낸다. 같은 채널로 두 번 응모한 것이라 부정이 명백하고,
 * 광고주가 최종선정을 누르기 전에 알아야 하는 정보다.
 *
 * 대행사 화면(`app/(dashboard)/…/applicants`)은 기본값 그대로 둘 다 본다.
 */
export function findDuplicates(
  applicants: Applicant[],
  opts: { includeContact?: boolean } = {}
): Map<string, string[]> {
  const { includeContact = true } = opts;
  const duplicatesMap = new Map<string, string[]>(); // applicant.id -> array of reasons

  /**
   * 주소에서 "같은 계정인가" 만 남긴다.
   *
   * **쿼리스트링을 반드시 버려야 한다.** 인스타그램 앱의 [링크 복사] 는
   * `https://www.instagram.com/abc/?igsh=MXQ2b2s=` 처럼 추적 값을 붙인다. 지원자 대다수가
   * 그 모양 그대로 붙여넣으므로, 안 버리면 **같은 계정을 다른 계정으로 본다.**
   * 순서가 중요하다 — 물음표를 먼저 떼야 끝 슬래시 제거가 제대로 걸린다.
   */
  const normalizeUrl = (url: string) =>
    url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/[?#].*$/, "")
      .replace(/\/$/, "");

  /**
   * 번호에서 숫자만 남긴다. `+82` 로 시작하면 국내 표기(0…)로 맞춘다 —
   * `+82 10-1234-5678` 과 `010-1234-5678` 은 같은 번호다.
   */
  const normalizePhone = (phone: string) => {
    const t = phone.trim();
    const digits = t.replace(/[^0-9]/g, "");
    if (t.startsWith("+82")) return `0${digits.slice(2)}`;
    return digits;
  };

  // 인덱스(`applicants[i]`) 대신 entries() 를 쓴다. 값이 반드시 있다는 사실이
  // 코드에 드러나서 "없을 수도 있는데?" 를 매번 방어할 필요가 없다.
  for (const [i, a] of applicants.entries()) {
    const reasons: string[] = [];

    for (const [j, b] of applicants.entries()) {
      if (i === j) continue;

      if (a.sns_link && b.sns_link && normalizeUrl(a.sns_link) === normalizeUrl(b.sns_link)) {
        reasons.push(`동일 SNS 계정 (${b.name})`);
      }
      // **정규화 결과가 비면 비교하지 않는다.** 이 앱은 국적 칸이 있는 해외 인플루언서도 받아서
      // 연락처에 이메일·카톡ID·"없음" 을 적는 경우가 흔하다. 그런 값은 숫자만 남기면 전부 빈
      // 문자열이 되어, **서로 아무 상관없는 지원자들이 죄다 "동일 연락처" 로 묶였다.**
      // 담당자가 정상 지원자를 부정으로 오해하게 되는 쪽이라 놓치는 것보다 나쁘다.
      const aPhone = includeContact && a.contact ? normalizePhone(a.contact) : "";
      const bPhone = includeContact && b.contact ? normalizePhone(b.contact) : "";
      if (aPhone && bPhone && aPhone === bPhone) {
        reasons.push(`동일 연락처 (${b.name})`);
      }
    }

    if (reasons.length > 0) {
      duplicatesMap.set(a.id, Array.from(new Set(reasons)));
    }
  }

  return duplicatesMap;
}
