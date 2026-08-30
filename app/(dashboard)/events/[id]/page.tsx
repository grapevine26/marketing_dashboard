import { notFound } from "next/navigation";
import Link from "next/link";
import { getEventById, getEventGuests } from "@/lib/db";
import GuestManager from "./GuestManager";
import {
  Calendar,
  MapPin,
  Users,
  Shirt,
  Share2,
  ExternalLink,
  QrCode,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";

export const revalidate = 0;

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  const guests = await getEventGuests(id);
  const attendingGuests = guests.filter((g) => g.rsvp_status === "attending");
  const checkedInCount = guests.filter((g) => g.checked_in).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      <div className="space-y-2">
        <Link
          href="/events"
          className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>행사 목록으로</span>
        </Link>

        <div className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold">
                {event.company_name}
              </span>
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {event.event_date} ({event.event_time})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-100">{event.title}</h1>
            <p className="text-xs sm:text-sm text-zinc-400 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{event.location}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/events/${event.id}/checkin`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition"
            >
              <QrCode className="w-4 h-4" />
              <span>현장 모바일 체크인 열기</span>
            </Link>
          </div>
        </div>
      </div>

      {/* RSVP Token Link Box */}
      <div className="p-5 rounded-2xl bg-[#131418] border border-indigo-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5" />
            <span>인플루언서 모바일 초청장 배포 링크 (RSVP)</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            인플루언서에게 이 링크를 전달하면 참석 여부 및 동반인 정보를 실시간으로 접수받을 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/events/rsvp/${event.rsvp_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-sm"
          >
            <span>초청장 페이지 열기</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <GuestManager event={event} initialGuests={guests} />
    </div>
  );
}