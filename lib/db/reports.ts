/**
 * 보고서 모듈.
 *
 * 캠페인 결과보고서의 조회·생성·섹션 편집을 맡는다.
 * 보고서는 생성 시점의 캠페인/지원자/시딩 기록을 `snapshot_data`(jsonb)에 통째로 박아 두므로,
 * 이후 원본 데이터가 바뀌어도 보고서 내용은 그대로다.
 *
 * 다른 도메인 모듈(campaigns, applicants)을 import 하지 않고 필요한 행을 직접 조회한다.
 * 모듈 간 순환 의존을 피하기 위해서다.
 */
import { db, unwrap, unwrapMaybe } from "./client";
import {
  rowToApplicant,
  rowToCampaign,
  rowToReport,
  rowToSeedingRecord,
  type ApplicantRow,
  type CampaignRow,
  type ReportRow,
  type SeedingRecordRow,
} from "./mappers";
import type { Applicant, Campaign, CampaignReport, ReportSnapshot, SeedingRecord } from "./types";
import { nowIso, optionalText, requireText, ValidationError } from "./validation";

// ---------- 조회 ----------

/** 캠페인의 보고서 목록. 생성 순(created_at asc)으로 준다. */
export async function getReportsByCampaignId(campaignId: string): Promise<CampaignReport[]> {
  const rows = unwrap(
    await db()
      .from("reports")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .returns<ReportRow[]>()
  );
  return rows.map(rowToReport);
}

export async function getReportById(reportId: string): Promise<CampaignReport | null> {
  const row = unwrapMaybe(
    await db().from("reports").select("*").eq("id", reportId).maybeSingle<ReportRow>()
  );
  return row ? rowToReport(row) : null;
}

// ---------- 섹션 편집 ----------

/**
 * 사용자가 편집한 커스텀 섹션을 저장한다.
 * 섹션 ID 는 필수, 제목·본문은 문자열이 아니면 빈 문자열로 두고 길이를 자른다.
 * 보고서가 없으면 null.
 */
export async function saveReportSections(
  reportId: string,
  customSections: CampaignReport["custom_sections"]
): Promise<CampaignReport | null> {
  const sections = (customSections || []).map((s) => ({
    id: requireText(s.id, "섹션 ID", 100),
    title: typeof s.title === "string" ? s.title.slice(0, 300) : "",
    content: typeof s.content === "string" ? s.content.slice(0, 10000) : "",
  }));
  const row = unwrapMaybe(
    await db()
      .from("reports")
      .update({ custom_sections: sections })
      .eq("id", reportId)
      .select("*")
      .maybeSingle<ReportRow>()
  );
  return row ? rowToReport(row) : null;
}

// ---------- 스냅샷 ----------

/** 보고서 생성 시점의 캠페인/지원자/관리시트 스냅샷과 지표를 만든다 (순수 함수, 테스트 가능). */
export function buildReportSnapshot(
  campaign: Campaign,
  applicants: Applicant[],
  seedingRecords: SeedingRecord[]
): ReportSnapshot {
  const seedingByApplicant = new Map(seedingRecords.map((s) => [s.applicant_id, s]));
  const snapshotApplicants = applicants.map((a) => ({
    ...a,
    seeding: seedingByApplicant.get(a.id) ?? null,
  }));
  const selected = snapshotApplicants.filter((a) => a.status === "selected");
  const selectedSeeding = selected.map((a) => a.seeding).filter((s): s is SeedingRecord => Boolean(s));
  const totalViews = selectedSeeding.reduce((acc, s) => acc + (s.views || 0), 0);
  const totalEngagement = selectedSeeding.reduce((acc, s) => acc + (s.engagement || 0), 0);
  return {
    campaign: { ...campaign },
    applicants: snapshotApplicants,
    metrics: {
      totalApplicants: applicants.length,
      selectedCount: selected.length,
      reservedCount: applicants.filter((a) => a.status === "reserved").length,
      completedUploads: selectedSeeding.filter(
        (s) => s.progress_stage === "업로드완료" || Boolean(s.upload_link)
      ).length,
      totalViews,
      totalEngagement,
      avgEngagementRate: totalViews > 0 ? Math.round((totalEngagement / totalViews) * 10000) / 100 : 0,
    },
  };
}

// ---------- 생성 ----------

/**
 * 보고서를 새로 만든다.
 * 캠페인·지원자·시딩 기록을 읽어 스냅샷을 찍고, 기본 총평 섹션 하나를 넣는다.
 * 제목을 안 주면 "<캠페인명> 결과보고서".
 */
export async function createReport(campaignId: string, title?: string): Promise<CampaignReport> {
  const campaignRow = unwrapMaybe(
    await db().from("campaigns").select("*").eq("id", campaignId).maybeSingle<CampaignRow>()
  );
  if (!campaignRow) throw new ValidationError("캠페인을 찾을 수 없습니다.");
  const campaign = rowToCampaign(campaignRow);

  // 지원자와 시딩 기록은 서로 독립이라 동시에 읽는다.
  const [applicantRows, seedingRows] = await Promise.all([
    db()
      .from("applicants")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("applied_at", { ascending: true })
      .returns<ApplicantRow[]>(),
    db()
      .from("seeding_records")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .returns<SeedingRecordRow[]>(),
  ]);
  const applicants = unwrap(applicantRows).map(rowToApplicant);
  const seeding = unwrap(seedingRows).map(rowToSeedingRecord);

  const snapshot = buildReportSnapshot(campaign, applicants, seeding);
  const generatedAt = nowIso();

  const row = unwrap(
    await db()
      .from("reports")
      .insert({
        campaign_id: campaignId,
        title: optionalText(title, 200) || `${campaign.name} 결과보고서`,
        snapshot_data: snapshot,
        custom_sections: [
          {
            id: "sec_default",
            title: "종합 성과 총평",
            content: `총 ${snapshot.metrics.totalApplicants}명 지원, ${snapshot.metrics.selectedCount}명 최종 선정, ${snapshot.metrics.completedUploads}건 업로드 완료.`,
          },
        ],
        generated_at: generatedAt,
        created_at: generatedAt,
      })
      .select("*")
      .single<ReportRow>()
  );
  return rowToReport(row);
}
