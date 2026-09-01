import { Applicant } from "@/lib/db/types";
import { generateCSV } from "@/lib/export/csv";

export function applicantsToCSV(applicants: Applicant[]): string {
  const headers = [
    "이름",
    "상태",
    "SNS 링크",
    "국적",
    "연락처",
    "배송주소/방문일정",
    "신청일시",
  ];

  const rows = applicants.map((a) => [
    a.name,
    a.status === "selected"
      ? "최종선정"
      : a.status === "dropped"
      ? "미선정"
      : "지원완료",
    a.sns_link,
    a.nationality,
    a.contact,
    a.shipping_address || a.visit_schedule || "-",
    new Date(a.applied_at).toLocaleString("ko-KR"),
  ]);

  return generateCSV(headers, rows);
}
