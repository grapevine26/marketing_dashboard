import { notFound } from "next/navigation";
import { getEventByToken } from "@/lib/db";
import RsvpPublicForm from "./RsvpPublicForm";
import { Sparkles, Calendar, MapPin, Shirt, PartyPopper } from "lucide-react";

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
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 flex flex-col items-center justify-center">
      <div className="max-w-md w-full space-y-6">
        {/* Invitation Card */}
        <div className="p-8 rounded-3xl bg-gradient-to-b from-purple-900/40 via-slate-900 to-slate-900 border border-purple-800/40 space-y-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center mx-auto shadow-inner">
            <PartyPopper className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <span className="text-xs uppercase font-bold tracking-widest text-purple-400">
              VIP INVITATION
            </span>
            <h1 className="text-2xl font-extrabold text-white leading-tight">
              {event.title}
            </h1>
            <p className="text-xs text-slate-400 font-medium">{event.company_name}</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-left space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
              <span>{event.event_date} ({event.event_time})</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-purple-400 shrink-0" />
              <span>{event.location}</span>
            </div>
            {event.dress_code && (
              <div className="flex items-center gap-2">
                <Shirt className="w-4 h-4 text-purple-400 shrink-0" />
                <span>드레스코드: {event.dress_code}</span>
              </div>
            )}
          </div>

          {event.guide_text && (
            <p className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed text-left">
              {event.guide_text}
            </p>
          )}

          <div className="pt-2 border-t border-slate-800">
            <RsvpPublicForm event={event} />
          </div>
        </div>
      </div>
    </div>
  );
}