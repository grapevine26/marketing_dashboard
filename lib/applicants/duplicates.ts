import { Applicant } from "@/lib/db/types";

export function findDuplicates(applicants: Applicant[]): Map<string, string[]> {
  const duplicatesMap = new Map<string, string[]>(); // applicant.id -> array of reasons

  const normalizeUrl = (url: string) =>
    url.trim().toLowerCase().replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "");
  const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, "");

  for (let i = 0; i < applicants.length; i++) {
    const a = applicants[i];
    const reasons: string[] = [];

    for (let j = 0; j < applicants.length; j++) {
      if (i === j) continue;
      const b = applicants[j];

      if (a.sns_link && b.sns_link && normalizeUrl(a.sns_link) === normalizeUrl(b.sns_link)) {
        reasons.push(`동일 SNS 계정 (${b.name})`);
      }
      if (a.contact && b.contact && normalizePhone(a.contact) === normalizePhone(b.contact)) {
        reasons.push(`동일 연락처 (${b.name})`);
      }
    }

    if (reasons.length > 0) {
      duplicatesMap.set(a.id, Array.from(new Set(reasons)));
    }
  }

  return duplicatesMap;
}
