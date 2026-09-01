import {
  getCampaigns,
  getAllSeedingRecords,
  getAllEvents,
  getAllEventChecklistItems,
  getSnsAccounts,
  getAllSnsContents,
} from "@/lib/db";
import { toKstDateString, daysUntilDeadline } from "@/lib/seeding/dday";
import CalendarOverviewClient, { UnifiedCalendarItem } from "./CalendarOverviewClient";

export const revalidate = 0;

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const todayKst = toKstDateString();
  const currentMonthStr = month || todayKst.slice(0, 7); // YYYY-MM

  // Resilient data loading using Promise.allSettled
  const [
    campaignsRes,
    seedingRecordsRes,
    eventsRes,
    eventChecklistsRes,
    snsAccountsRes,
    snsContentsRes,
  ] = await Promise.allSettled([
    getCampaigns(),
    getAllSeedingRecords(),
    getAllEvents(),
    getAllEventChecklistItems(),
    getSnsAccounts(),
    getAllSnsContents(),
  ]);

  const campaigns = campaignsRes.status === "fulfilled" ? campaignsRes.value : [];
  const seedingRecords = seedingRecordsRes.status === "fulfilled" ? seedingRecordsRes.value : [];
  const events = eventsRes.status === "fulfilled" ? eventsRes.value : [];
  const eventChecklists = eventChecklistsRes.status === "fulfilled" ? eventChecklistsRes.value : [];
  const snsAccounts = snsAccountsRes.status === "fulfilled" ? snsAccountsRes.value : [];
  const snsContents = snsContentsRes.status === "fulfilled" ? snsContentsRes.value : [];

  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const snsMap = new Map(snsAccounts.map((s) => [s.id, s]));

  const allItems: UnifiedCalendarItem[] = [];

  // 1. Seeding items (Subproject A)
  for (const s of seedingRecords) {
    if (s.upload_deadline && s.progress_stage !== "업로드완료") {
      const camp = campaignMap.get(s.campaign_id);
      const diff = daysUntilDeadline(s.upload_deadline, todayKst);
      allItems.push({
        id: `seed_${s.id}`,
        source: "seeding",
        title: `시딩 콘텐츠 업로드 마감`,
        dateStr: s.upload_deadline,
        linkUrl: `/campaigns/${s.campaign_id}/seeding-sheet`,
        brandName: camp?.company_name || camp?.name || "캠페인",
        extraInfo: `진행: ${s.progress_stage}`,
        daysDiff: diff,
      });
    }
  }

  // 2. Event & Event checklist items (Subproject B)
  for (const e of events) {
    if (e.event_at && e.status !== "done" && e.status !== "canceled") {
      const camp = campaignMap.get(e.campaign_id);
      const dateStr = e.event_at.split("T")[0];
      const diff = daysUntilDeadline(dateStr, todayKst);
      allItems.push({
        id: `event_${e.id}`,
        source: "event",
        title: e.name,
        dateStr,
        linkUrl: `/campaigns/${e.campaign_id}/events/${e.id}`,
        brandName: camp?.company_name || "행사",
        extraInfo: e.venue || "장소 미정",
        daysDiff: diff,
      });
    }
  }

  for (const chk of eventChecklists) {
    if (chk.due_date && !chk.done) {
      const parentEvent = eventMap.get(chk.event_id);
      const camp = parentEvent ? campaignMap.get(parentEvent.campaign_id) : null;
      const diff = daysUntilDeadline(chk.due_date, todayKst);
      allItems.push({
        id: `chk_${chk.id}`,
        source: "event_checklist",
        title: chk.label,
        dateStr: chk.due_date,
        linkUrl: parentEvent ? `/campaigns/${parentEvent.campaign_id}/events/${parentEvent.id}` : "#",
        brandName: camp?.company_name || parentEvent?.name || "행사 준비",
        extraInfo: chk.assignee ? `담당: ${chk.assignee}` : undefined,
        daysDiff: diff,
      });
    }
  }

  // 3. SNS content items (Subproject C)
  for (const c of snsContents) {
    if (c.scheduled_on && c.status !== "posted") {
      const acc = snsMap.get(c.account_id);
      const diff = daysUntilDeadline(c.scheduled_on, todayKst);
      allItems.push({
        id: `sns_${c.id}`,
        source: "sns",
        title: c.title,
        dateStr: c.scheduled_on,
        linkUrl: `/sns/${c.account_id}`,
        brandName: acc?.company_name || "SNS",
        extraInfo: `@${acc?.handle} (${c.status})`,
        daysDiff: diff,
      });
    }
  }

  // Filter urgent items (daysDiff <= 3) and sort (overdue first -> today -> D-1 -> D-2 -> D-3)
  const urgentItems = allItems
    .filter((item) => item.daysDiff <= 3)
    .sort((a, b) => a.daysDiff - b.daysDiff);

  // Filter items for current selected month (YYYY-MM)
  const monthItems = allItems.filter((item) => item.dateStr.startsWith(currentMonthStr));

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      <CalendarOverviewClient
        currentMonthStr={currentMonthStr}
        urgentItems={urgentItems}
        monthItems={monthItems}
      />
    </div>
  );
}