import { getAllEvents, getCampaigns, countEventInvitees } from "@/lib/db";
import { PartyPopper } from "lucide-react";
import NewGlobalEventModal from "./NewGlobalEventModal";
import AllEventsListClient, {
  type EventOverviewCardItem,
  type CampaignFilterOption,
} from "./AllEventsListClient";

export const revalidate = 0;

export default async function AllEventsOverviewPage() {
  // 초청 수는 행사마다 따로 부르지 않고 한 번에 센다. 행사가 늘수록 왕복이 그만큼 늘었고,
  // 그때마다 초청자 이름·연락처가 전부 딸려 왔다 — 이 화면은 수만 쓴다.
  // 오버뷰의 "준비중인 행사" 모달도 같은 함수를 쓴다. 각자 세면 언젠가 한쪽만 고쳐져 어긋난다.
  const [events, campaigns, inviteeCounts] = await Promise.all([
    getAllEvents(),
    getCampaigns(),
    countEventInvitees(),
  ]);
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  const cards: EventOverviewCardItem[] = await Promise.all(
    events.map(async (ev) => {
      const counts = inviteeCounts.get(ev.id);
      const camp = campaignMap.get(ev.campaign_id);
      return {
        id: ev.id,
        campaignId: ev.campaign_id,
        campaignName: camp?.name || "미지정 캠페인",
        companyName: camp?.company_name || "캠페인",
        name: ev.name,
        status: ev.status,
        eventAt: ev.event_at,
        venue: ev.venue,
        memo: ev.memo,
        inviteeCount: counts?.total ?? 0,
        attendingCount: counts?.attending ?? 0,
        attendedCount: counts?.attended ?? 0,
      };
    })
  );
  cards.sort((a, b) => (a.eventAt || "9999").localeCompare(b.eventAt || "9999"));

  const eventCountByCampaign = new Map<string, number>();
  for (const c of cards) {
    eventCountByCampaign.set(c.campaignId, (eventCountByCampaign.get(c.campaignId) || 0) + 1);
  }

  const campaignOptions: CampaignFilterOption[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    companyName: c.company_name,
    eventCount: eventCountByCampaign.get(c.id) || 0,
  }));

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight flex items-center gap-2">
            <PartyPopper className="w-6 h-6 text-teal-400" />
            <span>인플루언서 행사 관리 (전체)</span>
          </h1>
          <p className="text-xs sm:text-sm text-text-sub">
            캠페인에 연계된 팝업스토어, VIP 런칭 파티, 오프라인 초청(RSVP) 및 행사 운영안을 통합 관리합니다.
          </p>
        </div>
        <NewGlobalEventModal campaigns={campaigns} />
      </div>

      <AllEventsListClient initialCards={cards} campaigns={campaignOptions} />
    </div>
  );
}
