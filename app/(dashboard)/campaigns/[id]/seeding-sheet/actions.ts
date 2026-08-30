"use server";

import { updateSeedingRecord } from "@/lib/db";
import { ProgressStage } from "@/lib/db/types";
import { revalidatePath } from "next/cache";

export async function updateSeedingRecordAction(params: {
  seedingId: string;
  campaignId: string;
  patch: {
    progress_stage?: ProgressStage;
    upload_deadline?: string | null;
    upload_link?: string | null;
    views?: number;
    engagement?: number;
    notes?: string | null;
  };
}) {
  const updated = await updateSeedingRecord(params.seedingId, params.patch);
  revalidatePath(`/campaigns/${params.campaignId}`);
  revalidatePath(`/campaigns/${params.campaignId}/seeding-sheet`);
  revalidatePath(`/campaigns/${params.campaignId}/reports`);
  return { success: true, record: updated };
}