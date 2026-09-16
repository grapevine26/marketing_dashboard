import {
  getCampaigns,
  getAllSeedingRecords,
  getAllEvents,
  getAllEventChecklistItems,
  getSnsAccounts,
  getAllSnsContents,
  listApplicantSummaries,
  countEventInvitees,
  type ApplicantSummary,
} from "@/lib/db";
import {
  CAMPAIGN_STATUS_LABELS,
  SNS_CONTENT_STATUS_LABELS,
  type CampaignType,
  type SnsContentStatus,
} from "@/lib/db/types";
import { daysUntilDeadline, isoToKstDateString } from "@/lib/seeding/dday";
import { isUploadDone } from "@/lib/seeding/uploadDone";

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
    // 캠페인마다 지원자 전체를 **순차로** 부르던 자리다. 캠페인이 10개면 왕복 10번을
    // 줄줄이 기다렸고, 필요한 것은 이름뿐인데 연락처·주소까지 딸려 왔다.
    const applicantNames = new Map<string, string>();
    try {
      for (const a of await listApplicantSummaries()) {
        if (a.status === "selected") applicantNames.set(a.id, a.name);
      }
    } catch {
      /* 이름 조인 실패는 라벨만 빠진다 */
    }
    for (const s of seedingRes.rows) {
      if (!s.upload_deadline || isUploadDone(s)) continue;
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
        linkUrl: `/campaigns/${parentEvent.campaign_id}/events/${parentEvent.id}?tab=checklist&checklistId=${chk.id}`,
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
        linkUrl: `/sns/${c.account_id}?tab=list&contentId=${c.id}`,
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

/** "준비중인 행사" KPI 모달 한 줄. */
export interface HomePreparingEventSummary {
  id: string;
  campaignId: string;
  name: string;
  /** 브랜드(광고주) 이름 */
  companyName: string;
  campaignName: string;
  /** 행사 일시 ISO(UTC). 미정이면 null. */
  eventAt: string | null;
  venue: string | null;
  /** 오늘부터 행사일까지 남은 날수. 일시가 없으면 null. */
  daysDiff: number | null;
  inviteeCount: number;
  attendingCount: number;
}

export interface PendingApprovalSnsItem {
  id: string;
  accountId: string;
  accountCompanyName: string;
  accountHandle: string;
  platform: string;
  title: string;
  scheduledOn: string | null;
  assignee: string | null;
  clientComment: string | null;
  mediaCount: number;
  createdAt: string;
}

export interface ScheduledSnsItem {
  id: string;
  accountId: string;
  accountCompanyName: string;
  accountHandle: string;
  platform: string;
  title: string;
  scheduledOn: string;
  daysDiff: number;
  status: SnsContentStatus;
  statusLabel: string;
  assignee: string | null;
  mediaCount: number;
}

export interface HomeSummary {
  activeCampaignCount: number;
  newApplicantsThisMonth: number;
  totalSelectedCount: number;
  preparingEventCount: number;
  pendingApprovalSnsCount: number;
  pendingApprovalSnsContents: PendingApprovalSnsItem[];
  scheduledSnsThisWeekCount: number;
  scheduledSnsThisWeek: ScheduledSnsItem[];
  /**
   * 진행중(모집중~보고서 작성) 캠페인 전부, 최근 생성 순.
   * "진행중 캠페인" KPI 카드의 모달이 이걸 그대로 그린다. activeCampaignCount 와 길이가 같아야 한다.
   */
  activeCampaigns: HomeCampaignSummary[];
  /**
   * 준비중인 행사 전부, 가까운 일시 순(일시 미정은 뒤).
   * "준비중인 행사" KPI 카드의 모달이 이걸 그대로 그린다. preparingEventCount 와 길이가 같아야 한다.
   */
  preparingEvents: HomePreparingEventSummary[];
}

/**
 * 홈 화면 상단 요약 통계 + 진행중인 캠페인 카드 목록.
 * 캠페인이 삭제되어도 조용히 제외되며, 지원자 조회 실패는 해당 캠페인만 0으로 집계한다.
 */
export async function collectHomeSummary(todayKst: string): Promise<HomeSummary> {
  const [campaigns, events, snsContents, snsAccounts, inviteeCounts] = await Promise.all([
    getCampaigns(),
    getAllEvents().catch(() => []),
    getAllSnsContents().catch(() => []),
    getSnsAccounts().catch(() => []),
    // 한 번의 조회로 행사별 초청·참석확정 수를 센다. 실패해도 목록은 0 으로 그린다.
    countEventInvitees().catch(() => new Map()),
  ]);
  const currentYm = todayKst.slice(0, 7);

  // 캠페인마다 지원자 전체를 부르던 자리다. 조회 한 번으로 받아 캠페인별로 나눈다.
  // 조회가 실패하면 예전처럼 전부 0 으로 집계한다(화면은 뜨고 숫자만 비는 쪽).
  const summaries: ApplicantSummary[] = await listApplicantSummaries().catch(() => []);
  const byCampaign = new Map<string, ApplicantSummary[]>();
  for (const a of summaries) {
    const bucket = byCampaign.get(a.campaign_id);
    if (bucket) bucket.push(a);
    else byCampaign.set(a.campaign_id, [a]);
  }
  const perCampaign = campaigns.map((campaign) => ({
    campaign,
    applicants: byCampaign.get(campaign.id) ?? [],
  }));

  let newApplicantsThisMonth = 0;
  let totalSelectedCount = 0;
  for (const { applicants } of perCampaign) {
    for (const a of applicants) {
      if (a.applied_at?.startsWith(currentYm)) newApplicantsThisMonth++;
      if (a.status === "selected") totalSelectedCount++;
    }
  }

  const isActive = (status: string) => status !== "draft" && status !== "completed";

  // 자르지 않는다. 이 목록은 "진행중 캠페인" KPI 카드의 모달에 그대로 뜨는데,
  // 카드에 적힌 수(activeCampaignCount)와 모달 줄 수가 다르면 사람이 빠진 게 있다고 의심한다.
  const activeCampaigns: HomeCampaignSummary[] = perCampaign
    .filter(({ campaign }) => isActive(campaign.status))
    .sort((a, b) => b.campaign.created_at.localeCompare(a.campaign.created_at))
    .map(({ campaign, applicants }) => ({
      id: campaign.id,
      name: campaign.name,
      companyName: campaign.company_name,
      campaignType: campaign.campaign_type,
      statusLabel: CAMPAIGN_STATUS_LABELS[campaign.status],
      applicantCount: applicants.length,
      selectedCount: applicants.filter((a) => a.status === "selected").length,
    }));

  const preparingEventsRaw = events.filter((e) => e.status === "preparing");
  const preparingEventCount = preparingEventsRaw.length;

  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  // 자르지 않는다. 카드에 적힌 수(preparingEventCount)와 모달 줄 수가 달라지면 안 된다.
  const preparingEvents: HomePreparingEventSummary[] = preparingEventsRaw
    .map((e) => {
      const camp = campaignById.get(e.campaign_id);
      const dateStr = isoToKstDateString(e.event_at);
      const counts = inviteeCounts.get(e.id);
      return {
        id: e.id,
        campaignId: e.campaign_id,
        name: e.name,
        companyName: camp?.company_name || "캠페인",
        campaignName: camp?.name || "미지정 캠페인",
        eventAt: e.event_at,
        venue: e.venue,
        daysDiff: dateStr ? daysUntilDeadline(dateStr, todayKst) : null,
        inviteeCount: counts?.total ?? 0,
        attendingCount: counts?.attending ?? 0,
      };
    })
    // 가까운 행사가 위로. 일시가 없는 것은 뒤로 민다(정렬 기준이 없으니 마지막이 제자리다).
    .sort((a, b) => (a.eventAt || "9999").localeCompare(b.eventAt || "9999"));

  const accountMap = new Map(snsAccounts.map((a) => [a.id, a]));
  const pendingApprovalSnsContents: PendingApprovalSnsItem[] = snsContents
    .filter((c) => c.status === "pending_approval")
    .map((c) => {
      const acc = accountMap.get(c.account_id);
      return {
        id: c.id,
        accountId: c.account_id,
        accountCompanyName: acc?.company_name || "미지정 계정",
        accountHandle: acc?.handle || "",
        platform: acc?.platform || "instagram",
        title: c.title,
        scheduledOn: c.scheduled_on,
        assignee: c.assignee,
        clientComment: c.client_comment,
        mediaCount: c.media_attachments?.length || 0,
        createdAt: c.created_at,
      };
    })
    .sort((a, b) => {
      if (a.scheduledOn && b.scheduledOn) return a.scheduledOn.localeCompare(b.scheduledOn);
      if (a.scheduledOn) return -1;
      if (b.scheduledOn) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });

  const scheduledSnsThisWeek: ScheduledSnsItem[] = snsContents
    .filter((c) => {
      if (!c.scheduled_on || c.status === "posted") return false;
      const diff = daysUntilDeadline(c.scheduled_on, todayKst);
      return diff >= 0 && diff <= 6;
    })
    .map((c) => {
      const acc = accountMap.get(c.account_id);
      const diff = daysUntilDeadline(c.scheduled_on!, todayKst);
      return {
        id: c.id,
        accountId: c.account_id,
        accountCompanyName: acc?.company_name || "미지정 계정",
        accountHandle: acc?.handle || "",
        platform: acc?.platform || "instagram",
        title: c.title,
        scheduledOn: c.scheduled_on!,
        daysDiff: diff,
        status: c.status,
        statusLabel: SNS_CONTENT_STATUS_LABELS[c.status] || c.status,
        assignee: c.assignee,
        mediaCount: c.media_attachments?.length || 0,
      };
    })
    .sort((a, b) => a.daysDiff - b.daysDiff || a.scheduledOn.localeCompare(b.scheduledOn));

  return {
    activeCampaignCount: campaigns.filter((c) => isActive(c.status)).length,
    preparingEvents,
    newApplicantsThisMonth,
    totalSelectedCount,
    preparingEventCount,
    pendingApprovalSnsCount: pendingApprovalSnsContents.length,
    pendingApprovalSnsContents,
    scheduledSnsThisWeekCount: scheduledSnsThisWeek.length,
    scheduledSnsThisWeek,
    activeCampaigns,
  };
}
