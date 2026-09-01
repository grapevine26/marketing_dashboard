import { notFound } from "next/navigation";
import {
  getCampaignById,
  getEventById,
  getEventInvitees,
  getEventChecklistItems,
  getEventPlan,
  getPptTemplates,
  getApplicantsByCampaignId,
} from "@/lib/db";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import EventDetailClient from "./EventDetailClient";

export const revalidate = 0;

export default async function CampaignEventDetailPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id, eventId } = await params;
  const [campaign, event] = await Promise.all([
    getCampaignById(id),
    getEventById(eventId),
  ]);

  if (!campaign || !event) notFound();

  const [invitees, checklists, plan, templates, applicants] = await Promise.all([
    getEventInvitees(event.id),
    getEventChecklistItems(event.id),
    getEventPlan(event.id),
    getPptTemplates("event"),
    getApplicantsByCampaignId(campaign.id),
  ]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto font-sans">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href={`/campaigns/${campaign.id}/events`} className="hover:text-blue-400 flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>행사 목록으로</span>
        </Link>
        <span>/</span>
        <span className="text-zinc-200">{event.name}</span>
      </div>

      <EventDetailClient
        campaign={campaign}
        event={event}
        initialInvitees={invitees}
        initialChecklists={checklists}
        initialPlan={plan}
        templates={templates}
        applicants={applicants}
      />
    </div>
  );
}