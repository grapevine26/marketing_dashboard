import { Applicant, SeedingRecord } from "@/lib/db/types";

export interface SeedingRow {
  applicant: Applicant;
  seeding: SeedingRecord;
}

/**
 * 관리시트 행 = 최종선정(selected) 지원자 + 그 시딩 레코드.
 * 레코드가 아직 없는 예외 상황(구버전 데이터)에는 `temp_` id의 임시 행을 만들어 화면이 깨지지 않게 한다.
 * 임시 행은 편집이 불가하며, 선정 상태를 다시 토글하면 정식 레코드가 생성된다.
 */
export function mergeSeedingRows(
  campaignId: string,
  applicants: Applicant[],
  seedingRecords: SeedingRecord[]
): SeedingRow[] {
  const byApplicant = new Map(seedingRecords.map((s) => [s.applicant_id, s]));
  return applicants
    .filter((a) => a.status === "selected")
    .map((applicant) => ({
      applicant,
      seeding:
        byApplicant.get(applicant.id) ?? {
          id: `temp_${applicant.id}`,
          campaign_id: campaignId,
          applicant_id: applicant.id,
          progress_stage: "선정완료" as const,
          upload_deadline: null,
          upload_link: null,
          views: 0,
          engagement: 0,
          notes: null,
          created_at: applicant.applied_at,
          updated_at: applicant.applied_at,
        },
    }));
}
