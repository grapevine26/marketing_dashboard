import { getAllEvents, getCampaigns, getEventInvitees } from "@/lib/db";
import { EVENT_STATUS_LABELS } from "@/lib/db/types";
import { formatKstDateTime } from "@/lib/seeding/dday";
import Link from "next/link";
import { Calendar, MapPin, ArrowRight, PartyPopper, Building2 } from "lucide-react";
import NewGlobalEventModal from "./NewGlobalEventModal";

export const revalidate = 0;

export default async function AllEventsOverviewPage() {
  const [events, campaigns] = await Promise.all([getAllEvents(), getCampaigns()]);
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  const cards = await Promise.all(
    events.map(async (ev) => {
      const invitees = await getEventInvitees(ev.id);
      return {
        ev,
        camp: campaignMap.get(ev.campaign_id),
        inviteeCount: invitees.length,
        attendingCount: invitees.filter((i) => i.rsvp_status === "attending").length,
        attendedCount: invitees.filter((i) => i.attended).length,
      };
    })
  );
  cards.sort((a, b) => (a.ev.event_at || "9999").localeCompare(b.ev.event_at || "9999"));

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

      <div className="p-4 rounded-2xl bg-surface border border-border space-y-2">
        <span className="text-xs font-bold text-text-2">캠페인별 행사 바로가기:</span>
        <div className="flex flex-wrap gap-2">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}/events`} className="px-3 py-1.5 rounded-xl bg-bg hover:bg-surface2 border border-border text-xs text-text inline-flex items-center gap-1.5 transition">
              <Building2 className="w-3 h-3 text-teal-400" />
              <span>{c.name}</span>
              <ArrowRight className="w-3 h-3 text-text-muted" />
            </Link>
          ))}
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-surface space-y-3">
          <PartyPopper className="w-8 h-8 text-text-faint mx-auto" />
          <p className="text-text-sub text-xs sm:text-sm font-semibold">등록된 인플루언서 행사가 없습니다.</p>
          <p className="text-text-muted text-xs">상단의 [새 행사 개설] 버튼을 눌러 새 이벤트를 시작하세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(({ ev, camp, inviteeCount, attendingCount, attendedCount }) => (
            <Link
              key={ev.id}
              href={`/campaigns/${ev.campaign_id}/events/${ev.id}`}
              className="group p-5 rounded-2xl bg-surface border border-border hover:border-teal-500/40 hover:bg-surface2 transition flex flex-col justify-between space-y-4 shadow-md active:scale-[0.99]"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    ev.status === "preparing" ? "bg-teal-500/10 text-teal-400 border-teal-500/20"
                    : ev.status === "done" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-surface3 text-text-sub border-border"
                  }`}>
                    {EVENT_STATUS_LABELS[ev.status]}
                  </span>
                  <span className="text-xs text-text-sub flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatKstDateTime(ev.event_at) || "일시 미정"}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-text-muted font-medium block">{camp?.company_name || "캠페인"}</span>
                  <h2 className="text-base font-bold text-text group-hover:text-teal-400 transition leading-snug">{ev.name}</h2>
                  <p className="text-xs text-text-sub mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="truncate">{ev.venue || "장소 미정"}</span>
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-text-sub">
                <div className="flex items-center gap-3 font-mono tabular-nums">
                  <span>초청 <strong className="text-text">{inviteeCount}</strong></span>
                  <span>참석확정 <strong className="text-blue-400">{attendingCount}</strong></span>
                  <span>입장 <strong className="text-emerald-400">{attendedCount}</strong></span>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-teal-400 group-hover:translate-x-0.5 transition" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
