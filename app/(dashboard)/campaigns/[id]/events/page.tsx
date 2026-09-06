import { notFound } from "next/navigation";
import { getCampaignById, getEventsByCampaignId, getEventInvitees, getEventChecklistItems } from "@/lib/db";
import { EVENT_STATUS_LABELS } from "@/lib/db/types";
import { formatKstDateTime } from "@/lib/seeding/dday";
import Link from "next/link";
import { PartyPopper, Calendar, MapPin, ArrowRight, ChevronLeft } from "lucide-react";
import NewCampaignEventModal from "./NewCampaignEventModal";

export const revalidate = 0;

export default async function CampaignEventsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const events = await getEventsByCampaignId(campaign.id);
  const cards = await Promise.all(
    events.map(async (ev) => {
      const [invitees, checklists] = await Promise.all([getEventInvitees(ev.id), getEventChecklistItems(ev.id)]);
      return {
        ev,
        inviteeCount: invitees.length,
        attendingCount: invitees.filter((i) => i.rsvp_status === "attending").length,
        attendedCount: invitees.filter((i) => i.attended).length,
        doneChecklists: checklists.filter((c) => c.done).length,
        totalChecklists: checklists.length,
      };
    })
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      <div className="flex items-center gap-2 text-xs text-text-sub">
        <Link href={`/campaigns/${campaign.id}`} className="hover:text-blue-400 flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>{campaign.name} 허브</span>
        </Link>
        <span>/</span>
        <span className="text-text">인플루언서 행사 관리</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight flex items-center gap-2">
            <PartyPopper className="w-6 h-6 text-indigo-400" />
            <span>캠페인 연계 인플루언서 행사</span>
          </h1>
          <p className="text-xs sm:text-sm text-text-sub">
            {campaign.company_name} 브랜드 행사의 운영안(PPT), 인플루언서 초청(RSVP) 및 체크리스트를 관리합니다.
          </p>
        </div>

        <NewCampaignEventModal campaignId={campaign.id} />
      </div>

      {cards.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-surface space-y-3">
          <PartyPopper className="w-8 h-8 text-text-faint mx-auto" />
          <p className="text-text-sub text-xs sm:text-sm">등록된 행사가 없습니다.</p>
          <p className="text-text-muted text-xs">상단의 [새 행사 개설] 버튼을 눌러 VIP 파티/팝업 행사를 등록해보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map(({ ev, inviteeCount, attendingCount, attendedCount, doneChecklists, totalChecklists }) => (
            <Link
              key={ev.id}
              href={`/campaigns/${campaign.id}/events/${ev.id}`}
              className="group p-5 rounded-2xl bg-surface border border-border hover:border-indigo-500/40 hover:bg-surface2 transition flex flex-col justify-between space-y-4 shadow-md active:scale-[0.99]"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    ev.status === "preparing" ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
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
                  <h2 className="text-base font-bold text-text group-hover:text-indigo-400 transition leading-snug">{ev.name}</h2>
                  <p className="text-xs text-text-sub mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="truncate">{ev.venue || "장소 미정"}</span>
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-text-sub">
                <div className="flex items-center gap-3 font-mono tabular-nums">
                  <span>초대 <strong className="text-text">{inviteeCount}</strong></span>
                  <span>참석확정 <strong className="text-blue-400">{attendingCount}</strong></span>
                  <span>현장참석 <strong className="text-emerald-400">{attendedCount}</strong></span>
                  <span>체크리스트 <strong className="text-text">{doneChecklists}/{totalChecklists}</strong></span>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-indigo-400 group-hover:translate-x-0.5 transition" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
