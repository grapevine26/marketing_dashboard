import { notFound } from "next/navigation";
import { getCampaignById, getEventsByCampaignId, getEventInvitees, getEventChecklistItems } from "@/lib/db";
import Link from "next/link";
import { PartyPopper, Calendar, MapPin, Plus, ArrowRight, CheckCircle2, ChevronLeft } from "lucide-react";
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

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href={`/campaigns/${campaign.id}`} className="hover:text-blue-400 flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>{campaign.name} 허브</span>
        </Link>
        <span>/</span>
        <span className="text-zinc-200">인플루언서 행사 관리</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <PartyPopper className="w-6 h-6 text-indigo-400" />
            <span>캠페인 연계 인플루언서 행사</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            {campaign.company_name} 브랜드 행사의 운영안(PPT), 인플루언서 초청(RSVP) 및 체크리스트를 관리합니다.
          </p>
        </div>

        <NewCampaignEventModal campaignId={campaign.id} />
      </div>

      {events.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-[#22242A] rounded-2xl bg-[#131418] space-y-3">
          <PartyPopper className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-zinc-400 text-xs sm:text-sm">등록된 행사가 없습니다.</p>
          <p className="text-zinc-500 text-xs">상단의 [새 행사 만들기] 버튼을 눌러 VIP 파티/팝업 행사를 등록해보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map(async (ev) => {
            const [invitees, checklists] = await Promise.all([
              getEventInvitees(ev.id),
              getEventChecklistItems(ev.id),
            ]);
            const attendingCount = invitees.filter((i) => i.rsvp_status === "attending").length;
            const attendedCount = invitees.filter((i) => i.attended).length;
            const doneChecklists = checklists.filter((c) => c.done).length;

            return (
              <Link
                key={ev.id}
                href={`/campaigns/${campaign.id}/events/${ev.id}`}
                className="group p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-indigo-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 shadow-md active:scale-[0.99]"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold">
                      {ev.status === "preparing" ? "준비중" : ev.status === "done" ? "행사완료" : "취소됨"}
                    </span>
                    <span className="text-xs text-zinc-400 flex items-center gap-1 font-mono">
                      <Calendar className="w-3.5 h-3.5" />
                      {ev.event_at ? new Date(ev.event_at).toLocaleDateString() : "일시 미정"}
                    </span>
                  </div>

                  <div>
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
                    <span>초대: <strong className="text-zinc-200">{invitees.length}</strong>명</span>
                    <span>참석확정: <strong className="text-blue-400">{attendingCount}</strong>명</span>
                    <span>현장참석: <strong className="text-emerald-400">{attendedCount}</strong>명</span>
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