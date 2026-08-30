"use server";

import { createEvent, toggleGuestCheckin, updateGuestReviewLink, addOrUpdateEventGuest } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function createEventAction(params: {
  title: string;
  company_name: string;
  event_date: string;
  event_time: string;
  location: string;
  capacity: number;
  dress_code?: string;
  guide_text: string;
}) {
  const event = await createEvent(params);
  revalidatePath("/events");
  return { success: true, event };
}

export async function toggleCheckinAction(guestId: string, checkedIn: boolean, eventId: string) {
  const guest = await toggleGuestCheckin(guestId, checkedIn);
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/checkin`);
  return { success: true, guest };
}

export async function saveGuestReviewAction(guestId: string, reviewLink: string, eventId: string) {
  const guest = await updateGuestReviewLink(guestId, reviewLink);
  revalidatePath(`/events/${eventId}`);
  return { success: true, guest };
}