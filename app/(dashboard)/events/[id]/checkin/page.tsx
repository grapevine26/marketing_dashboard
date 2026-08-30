import { notFound } from "next/navigation";
import { getEventById, getEventGuests } from "@/lib/db";
import CheckinList from "./CheckinList";
import { QrCode, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const revalidate = 0;

export default async function EventCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  const guests = await getEventGuests(id);
  const attendingGuests = guests.filter((g) => g.rsvp_status === "attending");

  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100 p-4 sm:p-6 max-w-2xl mx-auto space-y-6 font-sans">
      <div className="space-y-1">
        <Link
          href={`/events/${event.id}`}
          className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>행사 관리로 돌아가기</span>
        </Link>
        <div className="flex items-center gap-2 pt-2">
          <QrCode className="w-6 h-6 text-blue-400" />
          <h1 className="text-xl font-bold text-zinc-100">{event.title} - 현장 체크인</h1>
        </div>
        <p className="text-xs text-zinc-400">
          방문 인플루언서의 성함 또는 연락처를 검색하여 원클릭으로 입장 체크인 처리합니다.
        </p>
      </div>

      <CheckinList event={event} initialGuests={attendingGuests} />
    </div>
  );
}