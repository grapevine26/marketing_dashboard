import {
  getCampaigns,
  getAllSeedingRecords,
  getAllEvents,
  getAllEventChecklistItems,
  getSnsAccounts,
  getAllSnsContents,
  getApplicantsByCampaignId,
} from "@/lib/db";
import { CAMPAIGN_STATUS_LABELS, type CampaignType } from "@/lib/db/types";
import { daysUntilDeadline, isoToKstDateString } from "@/lib/seeding/dday";

export type OverviewSource = "seeding" | "event" | "event_checklist" | "sns";

export interface UnifiedCalendarItem {
  id: string;
  source: OverviewSource;
  title: string;
  dateStr: string; // YYYY-MM-DD (KST)
  linkUrl: string;
  brandName: string;
  extraInfo?: string;
  daysDiff: number; // 0: today, <0: overdue, >0: upcoming
}

/** 조회 성공/실패를 값으로 구분한다. 실패를 빈 배열로 위장하지 않는다. */
export type SourceResult<T> = { ok: true; rows: T[] } | { ok: false; error: string };

export interface OverviewData {
  items: UnifiedCalendarItem[];
  /** 실패한 소스 라벨 목록 (배너용). 비어 있으면 전부 성공. */
  failedSources: string[];
}

async function safe<T>(label: string, fn: () => Promise<T[]>): Promise<SourceResult<T>> {
  try {
    return { ok: true, rows: await fn() };
  } catch (err) {
    console.error(`[overview] ${label} 조회 실패:`, err);
    return { ok: false, error: label };
  }
}

/**
 * A/B/C 4개 소스를 독립적으로 조회해 통합 일정 항목으로 합친다.
 * 한 소스가 실패해도 나머지는 렌더링되며, 실패한 소스는 failedSources로 알린다.
 */
export async function collectOverviewItems(todayKst: string): Promise<OverviewData> {
  const [campaignsRes, seedingRes, eventsRes, checklistRes, snsAccountsRes, snsContentsRes] = await Promise.all([
    safe("캠페인", getCampaigns),
    safe("시딩 관리시트", getAllSeedingRecords),
    safe("행사", getAllEvents),
    safe("행사 체크리스트", getAllEventChecklistItems),
    safe("SNS 계정", getSnsAccounts),
    safe("SNS 콘텐츠", getAllSnsContents),
  ]);

  const failedSources = [campaignsRes, seedingRes, eventsRes, checklistRes, snsAccountsRes, snsContentsRes]
    .filter((r): r is { ok: false; error: string } => !r.ok)
    .map((r) => r.error);

  const campaigns = campaignsRes.ok ? campaignsRes.rows : [];
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));
  const items: UnifiedCalendarItem[] = [];

  // A. 시딩 업로드 기한 (업로드완료가 아닌 최종선정 인플루언서)
  if (seedingRes.ok && campaignsRes.ok) {
    const applicantNames = new Map<string, string>();
    for (const c of campaigns) {
      try {
        const apps = await getApplicantsByCampaignId(c.id);
        for (const a of apps) if (a.status === "selected") applicantNames.set(a.id, a.name);
      } catch {
        /* 이름 조인 실패는 라벨만 빠진다 */
      }
    }
    for (const s of seedingRes.rows) {
      if (!s.upload_deadline || s.progress_stage === "업로드완료") continue;
      const camp = campaignMap.get(s.campaign_id);
      const name = applicantNames.get(s.applicant_id);
      if (!camp || !name) continue; // 삭제된 캠페인/선정 취소된 지원자는 조용히 제외
      items.push({
        id: `seed_${s.id}`,
        source: "seeding",
        title: `${name} 업로드 마감`,
        dateStr: s.upload_deadline,
        linkUrl: `/campaigns/${s.campaign_id}/seeding-sheet`,
        brandName: camp.name,
        extraInfo: `진행: ${s.progress_stage}`,
        daysDiff: daysUntilDeadline(s.upload_deadline, todayKst),
      });
    }
  }

  // B. 행사 일시 (준비중만) + 체크리스트 마감 (미완료만)
  const eventMap = new Map((eventsRes.ok ? eventsRes.rows : []).map((e) => [e.id, e]));
  if (eventsRes.ok) {
    for (const e of eventsRes.rows) {
      if (!e.event_at || e.status !== "preparing") continue;
      const dateStr = isoToKstDateString(e.event_at);
      if (!dateStr) continue;
      const camp = campaignMap.get(e.campaign_id);
      items.push({
        id: `event_${e.id}`,
        source: "event",
        title: e.name,
        dateStr,
        linkUrl: `/campaigns/${e.campaign_id}/events/${e.id}`,
        brandName: camp?.company_name || "행사",
        extraInfo: e.venue || "장소 미정",
        daysDiff: daysUntilDeadline(dateStr, todayKst),
      });
    }
  }
  if (checklistRes.ok && eventsRes.ok) {
    for (const chk of checklistRes.rows) {
      if (!chk.due_date || chk.done) continue;
      const parentEvent = eventMap.get(chk.event_id);
      if (!parentEvent) continue; // 부모 행사가 삭제된 항목은 제외
      const camp = campaignMap.get(parentEvent.campaign_id);
      items.push({
        id: `chk_${chk.id}`,
        source: "event_checklist",
        title: chk.label,
        dateStr: chk.due_date,
        linkUrl: `/campaigns/${parentEvent.campaign_id}/events/${parentEvent.id}?tab=checklist`,
        brandName: camp?.company_name || parentEvent.name,
        extraInfo: [parentEvent.name, chk.assignee ? `담당: ${chk.assignee}` : null].filter(Boolean).join(" • "),
        daysDiff: daysUntilDeadline(chk.due_date, todayKst),
      });
    }
  }

  // C. SNS 발행 예정일 (게시완료가 아닌 것)
  if (snsContentsRes.ok && snsAccountsRes.ok) {
    const snsMap = new Map(snsAccountsRes.rows.map((a) => [a.id, a]));
    for (const c of snsContentsRes.rows) {
      if (!c.scheduled_on || c.status === "posted") continue;
      const acc = snsMap.get(c.account_id);
      if (!acc) continue;
      items.push({
        id: `sns_${c.id}`,
        source: "sns",
        title: `${c.title} · @${acc.handle}`,
        dateStr: c.scheduled_on,
        linkUrl: `/sns/${c.account_id}`,
        brandName: acc.company_name,
        extraInfo: c.status === "pending_approval" ? "승인대기" : c.status === "approved" ? "승인완료" : c.status === "producing" ? "제작중" : "기획중",
        daysDiff: daysUntilDeadline(c.scheduled_on, todayKst),
      });
    }
  }

  items.sort((a, b) => a.daysDiff - b.daysDiff || a.dateStr.localeCompare(b.dateStr));
  return { items, failedSources };
}

export interface HomeCampaignSummary {
  id: string;
  name: string;
  companyName: string;
  campaignType: CampaignType;
  statusLabel: string;
  applicantCount: number;
  selectedCount: number;
}

export interface HomeSummary {
  activeCampaignCount: number;
  newApplicantsThisMonth: number;
  totalSelectedCount: number;
  /** 최근 생성된 진행중(모집중~보고서 작성) 캠페인 최대 3개. 홈 화면 카드 목록용. */
  activeCampaigns: HomeCampaignSummary[];
}

/**
 * 홈 화면 상단 요약 통계 + 진행중인 캠페인 카드 목록.
 * 캠페인이 삭제되어도 조용히 제외되며, 지원자 조회 실패는 해당 캠페인만 0으로 집계한다.
 */
export async function collectHomeSummary(todayKst: string): Promise<HomeSummary> {
  const campaigns = await getCampaigns();
  const currentYm = todayKst.slice(0, 7);

  const perCampaign = await Promise.all(
    campaigns.map(async (campaign) => {
      try {
        const applicants = await getApplicantsByCampaignId(campaign.id);
        return { campaign, applicants };
      } catch {
        return { campaign, applicants: [] };
      }
    })
  );

  let newApplicantsThisMonth = 0;
  let totalSelectedCount = 0;
  for (const { applicants } of perCampaign) {
    for (const a of applicants) {
      if (a.applied_at?.startsWith(currentYm)) newApplicantsThisMonth++;
      if (a.status === "selected") totalSelectedCount++;
    }
  }

  const isActive = (status: string) => status !== "draft" && status !== "completed";

  const activeCampaigns: HomeCampaignSummary[] = perCampaign
    .filter(({ campaign }) => isActive(campaign.status))
    .sort((a, b) => b.campaign.created_at.localeCompare(a.campaign.created_at))
    .slice(0, 3)
    .map(({ campaign, applicants }) => ({
      id: campaign.id,
      name: campaign.name,
      companyName: campaign.company_name,
      campaignType: campaign.campaign_type,
      statusLabel: CAMPAIGN_STATUS_LABELS[campaign.status],
      applicantCount: applicants.length,
      selectedCount: applicants.filter((a) => a.status === "selected").length,
    }));

  return {
    activeCampaignCount: campaigns.filter((c) => isActive(c.status)).length,
    newApplicantsThisMonth,
    totalSelectedCount,
    activeCampaigns,
  };
}
