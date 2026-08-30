"use server";

import { getEventByToken, addOrUpdateEventGuest } from "@/lib/db";
import { EventRsvpStatus } from "@/lib/db/types";

export async function submitRsvpAction(params: {
  token: string;
  name: string;
  sns_link: string;
  contact: string;
  rsvp_status: EventRsvpStatus;
  party_size: number;
  notes?: string;
}) {
  const event = await getEventByToken(params.token);
  if (!event) throw new Error("Invalid event token");

  const guest = await addOrUpdateEventGuest({
    eventId: event.id,
    name: params.name,
    sns_link: params.sns_link,
    contact: params.contact,
    rsvp_status: params.rsvp_status,
    party_size: params.party_size,
    notes: params.notes,
  });

  return { success: true, guest };
}