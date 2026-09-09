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
import { toKstDateString } from "@/lib/seeding/dday";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import EventDetailClient from "./EventDetailClient";

export const revalidate = 0;

export default async function CampaignEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ tab?: string; checklistId?: string }>;
}) {
  const { id, eventId } = await params;
  const { tab, checklistId } = await searchParams;
  const [campaign, event] = await Promise.all([getCampaignById(id), getEventById(eventId)]);

  if (!campaign || !event || event.campaign_id !== campaign.id) notFound();

  const [invitees, checklists, plan, templates, applicants] = await Promise.all([
    getEventInvitees(event.id),
    getEventChecklistItems(event.id),
    getEventPlan(event.id),
    getPptTemplates("event"),
    getApplicantsByCampaignId(campaign.id),
  ]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto font-sans">
      <div className="flex items-center gap-2 text-xs text-text-sub">
        <Link href={`/campaigns/${campaign.id}/events`} className="hover:text-blue-400 flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>행사 목록으로</span>
        </Link>
        <span>/</span>
        <span className="text-text">{event.name}</span>
      </div>

      <EventDetailClient
        campaign={campaign}
        event={event}
        initialInvitees={invitees}
        initialChecklists={checklists}
        initialPlan={plan}
        templates={templates.map((t) => ({ id: t.id, name: t.name, placeholders: t.placeholders, builtin: Boolean(t.builtin) }))}
        applicants={applicants}
        todayKst={toKstDateString()}
        initialTab={tab === "checklist" || tab === "plan" ? tab : "invitees"}
        highlightChecklistId={checklistId}
      />
    </div>
  );
}
