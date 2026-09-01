import { getAllEvents, getCampaigns, getEventInvitees } from "@/lib/db";
import Link from "next/link";
import { Calendar, MapPin, ArrowRight, PartyPopper, Building2, Sparkles, Users, CheckSquare } from "lucide-react";
import NewGlobalEventModal from "./NewGlobalEventModal";

export const revalidate = 0;

export default async function AllEventsOverviewPage() {
  const [events, campaigns] = await Promise.all([
    getAllEvents(),
    getCampaigns(),
  ]);

  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <PartyPopper className="w-6 h-6 text-indigo-400" />
            <span>인플루언서 행사 관리 (전체)</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            캠페인에 연계된 팝업스토어, VIP 런칭 파티, 오프라인 초청(RSVP) 및 행사 운영안을 통합 관리합니다.
          </p>
        </div>

        {/* New Event Button Modal */}
        <NewGlobalEventModal campaigns={campaigns} />
      </div>

      {/* Campaign List Quick Link to filter events */}
      <div className="p-4 rounded-2xl bg-[#131418] border border-[#22242A] space-y-2">
        <span className="text-xs font-bold text-zinc-300">캠페인별 행사 바로가기:</span>
        <div className="flex flex-wrap gap-2">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}/events`}
              className="px-3 py-1.5 rounded-xl bg-[#090A0C] hover:bg-[#181A20] border border-[#22242A] text-xs text-zinc-200 inline-flex items-center gap-1.5 transition"
            >
              <Building2 className="w-3 h-3 text-indigo-400" />
              <span>{c.name}</span>
              <ArrowRight className="w-3 h-3 text-zinc-500" />
            </Link>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-[#22242A] rounded-2xl bg-[#131418] space-y-3">
          <PartyPopper className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-zinc-400 text-xs sm:text-sm font-semibold">등록된 인플루언서 행사가 없습니다.</p>
          <p className="text-zinc-500 text-xs">상단의 [새 행사 개설] 버튼을 눌러 새 이벤트를 시작하세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map(async (ev) => {
            const camp = campaignMap.get(ev.campaign_id);
            const invitees = await getEventInvitees(ev.id);
            const attendingCount = invitees.filter((i) => i.rsvp_status === "attending").length;
            const attendedCount = invitees.filter((i) => i.attended).length;

            return (
              <Link
                key={ev.id}
                href={`/campaigns/${ev.campaign_id}/events/${ev.id}`}
                className="group p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-indigo-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 shadow-md active:scale-[0.99]"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold">
                      {ev.status === "preparing" ? "준비중" : ev.status === "done" ? "행사완료" : "취소"}
                    </span>
                    <span className="text-xs text-zinc-400 flex items-center gap-1 font-mono">
                      <Calendar className="w-3.5 h-3.5" />
                      {ev.event_at ? new Date(ev.event_at).toLocaleDateString() : "일시 미정"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-zinc-500 font-medium block">{camp?.company_name || "캠페인"}</span>
                    <h2 className="text-base font-bold text-zinc-100 group-hover:text-indigo-400 transition leading-snug">
                      {ev.name}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="truncate">{ev.venue || "장소 미정"}</span>
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#22242A] flex items-center justify-between text-xs text-zinc-400">
                  <div className="flex items-center gap-3">
                    <span>초청: <strong className="text-zinc-200">{invitees.length}</strong>명</span>
                    <span>참석확정: <strong className="text-blue-400">{attendingCount}</strong>명</span>
                    <span>입장: <strong className="text-emerald-400">{attendedCount}</strong>명</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}