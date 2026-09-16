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

  const normalizeUrl = (url: string) =>
    url.trim().toLowerCase().replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "");
  const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, "");

  // 인덱스(`applicants[i]`) 대신 entries() 를 쓴다. 값이 반드시 있다는 사실이
  // 코드에 드러나서 "없을 수도 있는데?" 를 매번 방어할 필요가 없다.
  for (const [i, a] of applicants.entries()) {
    const reasons: string[] = [];

    for (const [j, b] of applicants.entries()) {
      if (i === j) continue;

      if (a.sns_link && b.sns_link && normalizeUrl(a.sns_link) === normalizeUrl(b.sns_link)) {
        reasons.push(`동일 SNS 계정 (${b.name})`);
      }
      if (includeContact && a.contact && b.contact && normalizePhone(a.contact) === normalizePhone(b.contact)) {
        reasons.push(`동일 연락처 (${b.name})`);
      }
    }

    if (reasons.length > 0) {
      duplicatesMap.set(a.id, Array.from(new Set(reasons)));
    }
  }

  return duplicatesMap;
}
