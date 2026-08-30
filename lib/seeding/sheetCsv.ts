import { Applicant, SeedingRecord } from "@/lib/db/types";
import { generateCSV } from "@/lib/export/csv";

export function seedingSheetToCSV(
  records: { applicant: Applicant; seeding: SeedingRecord }[]
): string {
  const headers = [
    "인플루언서 이름",
    "SNS 링크",
    "진행 단계",
    "업로드 기한",
    "업로드 링크",
    "조회수",
    "인게이지먼트",
    "배송지/방문정보",
    "비고(메모)",
  ];

  const rows = records.map(({ applicant, seeding }) => [
    applicant.name,
    applicant.sns_link,
    seeding.progress_stage,
    seeding.upload_deadline || "-",
    seeding.upload_link || "-",
    seeding.views,
    seeding.engagement,
    seeding.shipping_address || seeding.visit_scheduled_at || "-",
    seeding.notes || "-",
  ]);

  return generateCSV(headers, rows);
}
