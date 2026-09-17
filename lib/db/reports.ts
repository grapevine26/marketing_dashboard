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
import { insertAuditLog } from "./audit";
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
import { isUuid, nowIso, optionalText, requireText, ValidationError } from "./validation";
import { updateRowWithLock } from "./row-lock";
import { isUploadDone } from "@/lib/seeding/uploadDone";
import { josa } from "@/lib/ui/josa";

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
  customSections: CampaignReport["custom_sections"],
  /**
   * 화면이 이 보고서를 불러올 때 받은 기준 시각.
   *
   * 총평은 **문서 전체를 통째로 덮어쓴다.** 그래서 탭 두 개로 열어 놓고 차례로 저장하면
   * 뒤에 저장한 쪽이 앞사람이 쓴 것을 경고 없이 지운다(실제로 이 표만 잠금이 없었다).
   * 같은 성격의 다른 문서는 전부 잠금을 쓴다.
   *
   * 안 보내면 잠그지 않는다 — 옛 화면이나 잠금이 필요 없는 경로를 위해 열어 두지만,
   * 이 앱의 편집 화면은 반드시 보낸다.
   */
  expectedUpdatedAt?: string | null
): Promise<CampaignReport | null> {
  const sections = (customSections || []).map((s) => ({
    id: requireText(s.id, "섹션 ID", 100),
    title: typeof s.title === "string" ? s.title.slice(0, 300) : "",
    content: typeof s.content === "string" ? s.content.slice(0, 10000) : "",
  }));
  const row = await updateRowWithLock<ReportRow>({
    table: "reports",
    id: reportId,
    values: { custom_sections: sections },
    expectedUpdatedAt,
  });
  // 없는 보고서면 아무것도 안 바뀌었으므로 로그도 남기지 않는다.
  if (!row) return null;
  const report = rowToReport(row);

  // audit_logs.entity_type 에 보고서 전용 값이 없어 campaign 을 쓴다.
  // campaign_id 는 update 가 돌려준 행에서 가져온다(추가 조회 없음).
  await insertAuditLog({
    campaign_id: report.campaign_id,
    entity_type: "campaign",
    entity_id: report.campaign_id,
    action: "report.sections_saved",
    actor_type: "agency",
    summary: `[${report.title}] 보고서의 본문 섹션을 저장했습니다. (${sections.length}개)`,
  });

  return report;
}

// ---------- 제목 변경 / 삭제 ----------

/**
 * 보고서 제목을 바꾼다. 보고서가 없으면 null.
 *
 * **기준 시각을 왜 여기에도 거는가** — 제목은 한 칸짜리 값이라 `row-lock.ts` 의 기준대로면
 * 잠그지 않아도 되는 쪽이다(덮어쓸 남의 글이 없다). 그런데 제목과 총평은 **같은 행**을 고치고,
 * 상세 화면에서 **나란히** 놓여 있다. `updated_at` 은 어느 쪽으로 고쳐도 DB 트리거가 새로 찍는다.
 *
 * 그래서 제목만 잠금 밖에 두면 이렇게 된다:
 *
 *   1. A 가 상세 화면을 연다 (기준 10:00)
 *   2. B 가 총평을 고쳐 저장한다 (updated_at = 10:05)
 *   3. A 가 제목을 바꾼다 → 잠금이 없으니 통과하고, 화면의 기준 시각은 10:07 로 **앞당겨진다**
 *   4. A 가 총평을 저장한다 → 기준이 맞으므로 통과 → **B 가 쓴 총평이 조용히 사라진다**
 *
 * 제목 변경이 총평 잠금을 풀어 주는 열쇠가 되는 셈이다. 그래서 제목도 같은 기준 시각을 쓰고,
 * 성공하면 새 기준 시각을 돌려준다. 화면은 제목·총평이 **하나의 기준 시각을 공유**한다
 * (`ReportLock.tsx`). 공유하지 않으면 제목을 바꾼 직후 총평 저장이 **자기 자신과 충돌**한다.
 */
export async function renameReport(
  reportId: string,
  title: string,
  expectedUpdatedAt?: string | null
): Promise<CampaignReport | null> {
  const nextTitle = requireText(title, "보고서 제목", 200);
  // uuid 가 아니면 조회 자체가 Postgres 타입 오류(500)가 된다. "없음"으로 돌린다.
  if (!isUuid(reportId)) return null;
  // 감사 로그에 "무엇에서 무엇으로" 를 남기려면 옛 제목이 필요하다. 조회는 이 한 번뿐이다.
  const before = await getReportById(reportId);
  if (!before) return null;
  if (before.title === nextTitle) return before; // 같은 값이면 행을 건드리지 않는다(기준 시각도 그대로).

  const row = await updateRowWithLock<ReportRow>({
    table: "reports",
    id: reportId,
    values: { title: nextTitle },
    expectedUpdatedAt,
  });
  if (!row) return null;
  const report = rowToReport(row);

  // audit_logs.entity_type 에 보고서 전용 값이 없어 campaign 을 쓴다. (기존 보고서 로그와 같은 형식)
  await insertAuditLog({
    campaign_id: report.campaign_id,
    entity_type: "campaign",
    entity_id: report.campaign_id,
    action: "report.renamed",
    actor_type: "agency",
    summary: `보고서 제목을 [${before.title}]에서 [${report.title}]${josa(report.title, "로")} 바꿨습니다.`,
  });

  return report;
}

/**
 * 보고서를 지운다. 없으면 false.
 *
 * 되돌릴 수 없다 — 스냅샷과 총평이 함께 사라진다. 확인은 화면에서 받는다
 * (체크리스트 삭제와 같은 `confirm`. 캠페인 삭제처럼 이름을 받아쓰게 하지는 않는다 —
 * 보고서는 언제든 다시 생성할 수 있고, 잃는 것은 그때 찍힌 숫자와 총평이다).
 */
export async function deleteReport(reportId: string): Promise<boolean> {
  if (!isUuid(reportId)) return false;
  const target = await getReportById(reportId);
  if (!target) return false;

  // 감사 로그를 먼저 남긴다. audit_logs 는 fk 가 없어 보고서가 지워져도 기록이 남는다.
  await insertAuditLog({
    campaign_id: target.campaign_id,
    entity_type: "campaign",
    entity_id: target.campaign_id,
    action: "report.deleted",
    actor_type: "agency",
    summary: `[${target.title}] 보고서를 삭제했습니다.`,
  });

  unwrap(await db().from("reports").delete().eq("id", reportId));
  return true;
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
        (s) => isUploadDone(s)
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
  // 서버 기본 시간대는 UTC 라 한국 시간으로 못 박는다(화면·PDF 와 같은 방식).
  const generatedDay = new Date(generatedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

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
            // 이 문장은 **생성 시점 숫자를 그대로 문장에 박아 넣는다.** 지표는 스냅샷이라 여기서
            // 멈추는데 총평은 나중에 계속 고치므로, 며칠 뒤에는 이 문장만 옛날 숫자로 남는다.
            // (실제로 "업로드 0건" 문장 아래에 담당자가 "12건 완료" 라고 쓴 보고서가 나갔다.)
            // 숫자를 빼면 기본 총평이 텅 비므로, 대신 **언제 기준인지**를 문장 안에 남긴다.
            content: `총 ${snapshot.metrics.totalApplicants}명 지원, ${snapshot.metrics.selectedCount}명 최종 선정, ${snapshot.metrics.completedUploads}건 업로드 완료. (${generatedDay} 생성 시점 기준)`,
          },
        ],
        generated_at: generatedAt,
        created_at: generatedAt,
      })
      .select("*")
      .single<ReportRow>()
  );
  const report = rowToReport(row);

  // audit_logs.entity_type 에 보고서 전용 값이 없어 campaign 을 쓴다.
  await insertAuditLog({
    campaign_id: campaignId,
    entity_type: "campaign",
    entity_id: campaignId,
    action: "report.created",
    actor_type: "agency",
    summary: `[${report.title}] 보고서를 생성했습니다.`,
  });

  return report;
}
