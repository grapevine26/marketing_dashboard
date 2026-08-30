import { notFound } from "next/navigation";
import { getEventByToken } from "@/lib/db";
import RsvpPublicForm from "./RsvpPublicForm";
import { Calendar, MapPin, Shirt, PartyPopper } from "lucide-react";

export const revalidate = 0;

export default async function PublicEventRsvpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const event = await getEventByToken(token);
  if (!event) notFound();

  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100 py-12 px-4 sm:px-6 flex flex-col items-center justify-center font-sans">
      <div className="max-w-md w-full space-y-6">
        <div className="p-8 rounded-3xl bg-[#131418] border border-indigo-900/30 space-y-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
            <PartyPopper className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">
              VIP INVITATION
            </span>
            <h1 className="text-2xl font-extrabold text-zinc-100 leading-tight">
              {event.title}
            </h1>
            <p className="text-xs text-zinc-400 font-medium">{event.company_name}</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] text-left space-y-2 text-xs text-zinc-300">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{event.event_date} ({event.event_time})</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{event.location}</span>
            </div>
            {event.dress_code && (
              <div className="flex items-center gap-2">
                <Shirt className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>드레스코드: {event.dress_code}</span>
              </div>
            )}
          </div>

          {event.guide_text && (
            <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed text-left">
              {event.guide_text}
            </p>
          )}

          <div className="pt-2 border-t border-[#22242A]">
            <RsvpPublicForm event={event} />
          </div>
        </div>
      </div>
    </div>
  );
}