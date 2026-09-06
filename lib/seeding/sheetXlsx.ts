import { Applicant, SeedingRecord } from "@/lib/db/types";
import { generateXlsxBuffer } from "@/lib/export/xlsx";
import { calculateDDay } from "@/lib/seeding/dday";

export async function seedingSheetToXlsx(
  records: { applicant: Applicant; seeding: SeedingRecord }[],
  todayKst?: string
): Promise<Buffer> {
  const columns = [
    { header: "인플루언서 이름", key: "name", alignment: { horizontal: "center" as const } },
    { header: "SNS 링크", key: "sns_link" },
    { header: "진행 단계", key: "progress_stage", alignment: { horizontal: "center" as const } },
    { header: "업로드 기한", key: "upload_deadline", alignment: { horizontal: "center" as const } },
    { header: "D-day", key: "d_day", alignment: { horizontal: "center" as const } },
    { header: "업로드 링크", key: "upload_link" },
    { header: "조회수", key: "views", alignment: { horizontal: "right" as const } },
    { header: "인게이지먼트", key: "engagement", alignment: { horizontal: "right" as const } },
    { header: "배송지/방문정보", key: "address_or_schedule" },
    { header: "비고(메모)", key: "notes" },
  ];

  const rows = records.map(({ applicant, seeding }) => ({
    name: applicant.name,
    sns_link: applicant.sns_link,
    progress_stage: seeding.progress_stage,
    upload_deadline: seeding.upload_deadline || "-",
    d_day: seeding.upload_deadline ? calculateDDay(seeding.upload_deadline, todayKst).label : "-",
    upload_link: seeding.upload_link || "-",
    views: seeding.views != null ? Number(seeding.views) : "",
    engagement: seeding.engagement != null ? Number(seeding.engagement) : "",
    address_or_schedule: applicant.shipping_address || applicant.visit_schedule || "-",
    notes: seeding.notes || "-",
  }));

  return generateXlsxBuffer([{ name: "시딩관리시트", columns, rows }]);
}
