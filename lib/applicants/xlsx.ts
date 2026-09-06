import { Applicant, CustomFormQuestion, APPLICANT_STATUS_LABELS } from "@/lib/db/types";
import { generateXlsxBuffer } from "@/lib/export/xlsx";

export async function applicantsToXlsx(
  applicants: Applicant[],
  customQuestions: CustomFormQuestion[] = [],
  options: { includeContact?: boolean } = {}
): Promise<Buffer> {
  const includeContact = options.includeContact ?? true;
  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";

  const columns = [
    { header: "이름", key: "name", alignment: { horizontal: "center" as const } },
    { header: "상태", key: "status", alignment: { horizontal: "center" as const } },
    { header: "SNS 링크", key: "sns_link" },
    { header: "팔로워 수", key: "follower_count", alignment: { horizontal: "right" as const } },
    { header: "카테고리", key: "category", alignment: { horizontal: "center" as const } },
    { header: "국적", key: "nationality", alignment: { horizontal: "center" as const } },
    ...(includeContact
      ? [
          { header: "연락처", key: "contact", alignment: { horizontal: "center" as const } },
          { header: "배송주소/방문일정", key: "address_or_schedule" },
          { header: "방문 인원", key: "party_size", alignment: { horizontal: "center" as const } },
          { header: "에이전시 메모", key: "agency_memo" },
        ]
      : []),
    ...customQuestions.map((q) => ({
      header: q.label,
      key: `custom_${q.id}`,
    })),
    { header: "2차활용 동의", key: "secondary_use_agreed", alignment: { horizontal: "center" as const } },
    { header: "선정 변경 주체", key: "status_changed_by", alignment: { horizontal: "center" as const } },
    { header: "선정 변경 일시", key: "status_changed_at", alignment: { horizontal: "center" as const } },
    { header: "신청일시", key: "applied_at", alignment: { horizontal: "center" as const } },
  ];

  const rows = applicants.map((a) => {
    const rowObj: Record<string, unknown> = {
      name: a.name,
      status: APPLICANT_STATUS_LABELS[a.status] ?? a.status,
      sns_link: a.sns_link,
      follower_count: a.follower_count != null ? Number(a.follower_count) : "",
      category: a.category || "",
      nationality: a.nationality,
      secondary_use_agreed: a.secondary_use_agreed ? "예" : "아니오",
      status_changed_by: a.status_changed_by === "company" ? "광고주" : "에이전시",
      status_changed_at: fmt(a.status_changed_at),
      applied_at: fmt(a.applied_at),
    };

    if (includeContact) {
      rowObj.contact = a.contact;
      rowObj.address_or_schedule = a.shipping_address || a.visit_schedule || "-";
      rowObj.party_size = a.visit_party_size ?? "";
      rowObj.agency_memo = a.agency_memo || "";
    }

    for (const q of customQuestions) {
      const v = a.custom_answers?.[q.id];
      if (v === undefined || v === null) {
        rowObj[`custom_${q.id}`] = "";
      } else if (typeof v === "boolean") {
        rowObj[`custom_${q.id}`] = v ? "예" : "아니오";
      } else {
        rowObj[`custom_${q.id}`] = String(v);
      }
    }

    return rowObj;
  });

  return generateXlsxBuffer([{ name: "지원자목록", columns, rows }]);
}
