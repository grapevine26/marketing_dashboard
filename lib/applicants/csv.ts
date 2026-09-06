import { Applicant, CustomFormQuestion, APPLICANT_STATUS_LABELS } from "@/lib/db/types";
import { generateCSV } from "@/lib/export/csv";

/**
 * 지원자 리스트 CSV.
 * `includeContact=false`면 연락처·주소 같은 개인정보 컬럼을 뺀다 (광고주 공유 링크용).
 */
export function applicantsToCSV(
  applicants: Applicant[],
  customQuestions: CustomFormQuestion[] = [],
  options: { includeContact?: boolean } = {}
): string {
  const includeContact = options.includeContact ?? true;
  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";

  const headers = [
    "이름",
    "상태",
    "SNS 링크",
    "국적",
    ...(includeContact ? ["연락처", "배송주소/방문일정", "방문 인원"] : []),
    ...customQuestions.map((q) => q.label),
    "2차활용 동의",
    "선정 변경 주체",
    "선정 변경 일시",
    "신청일시",
  ];

  const rows = applicants.map((a) => [
    a.name,
    APPLICANT_STATUS_LABELS[a.status] ?? a.status,
    a.sns_link,
    a.nationality,
    ...(includeContact
      ? [a.contact, a.shipping_address || a.visit_schedule || "-", a.visit_party_size ?? ""]
      : []),
    ...customQuestions.map((q) => {
      const v = a.custom_answers?.[q.id];
      if (v === undefined || v === null) return "";
      if (typeof v === "boolean") return v ? "예" : "아니오";
      return String(v);
    }),
    a.secondary_use_agreed ? "예" : "아니오",
    a.status_changed_by === "company" ? "광고주" : "에이전시",
    fmt(a.status_changed_at),
    fmt(a.applied_at),
  ]);

  return generateCSV(headers, rows);
}
