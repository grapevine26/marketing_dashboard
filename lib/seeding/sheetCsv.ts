import { Applicant, SeedingRecord } from "@/lib/db/types";
import { generateCSV } from "@/lib/export/csv";
import { calculateDDay } from "@/lib/seeding/dday";

export function seedingSheetToCSV(
  records: { applicant: Applicant; seeding: SeedingRecord }[],
  todayKst?: string
): string {
  const headers = [
    "인플루언서 이름",
    "SNS 링크",
    "진행 단계",
    "업로드 기한",
    "D-day",
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
    seeding.upload_deadline ? calculateDDay(seeding.upload_deadline, todayKst).label : "-",
    seeding.upload_link || "-",
    seeding.views,
    seeding.engagement,
    applicant.shipping_address || applicant.visit_schedule || "-",
    seeding.notes || "-",
  ]);

  return generateCSV(headers, rows);
}
