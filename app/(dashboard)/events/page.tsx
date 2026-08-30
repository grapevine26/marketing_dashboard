import { getEvents, getEventGuests } from "@/lib/db";
import Link from "next/link";
import { Plus, Calendar, MapPin, Users, ArrowRight, Sparkles, PartyPopper } from "lucide-react";
import NewEventModal from "./NewEventModal";

export const revalidate = 0;

export default async function EventsListPage() {
  const events = await getEvents();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <PartyPopper className="w-6 h-6 text-purple-400" />
            <span>인플루언서 행사 관리</span>
          </h1>
          <p className="text-sm text-slate-400">
            팝업스토어, 런칭 파티 등 오프라인 행사의 인플루언서 초청(RSVP), 참석자 명단 및 현장 체크인을 관리합니다.
          </p>
        </div>
        <NewEventModal />
      </div>

      {events.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 space-y-3">
          <p className="text-slate-400">등록된 행사가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {events.map(async (ev) => {
            const guests = await getEventGuests(ev.id);
            const attendingCount = guests.filter((g) => g.rsvp_status === "attending").length;
            const checkedInCount = guests.filter((g) => g.checked_in).length;

            return (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className="group p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-900/80 transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-semibold">
                      오프라인 행사
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {ev.event_date} ({ev.event_time})
                    </span>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-white group-hover:text-purple-400 transition leading-snug">
                      {ev.title}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>{ev.location}</span>
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 text-slate-400">
                    <span>참석 확정: <strong className="text-emerald-400">{attendingCount}</strong>/{ev.capacity}명</span>
                    <span>체크인: <strong className="text-blue-400">{checkedInCount}</strong>명</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}