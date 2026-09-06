"use server";

import { updateSeedingRecord } from "@/lib/db";
import { ProgressStage, SeedingRecord } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAction, fail } from "@/lib/actions/result";

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
}): Promise<ActionResult<SeedingRecord>> {
  if (params.seedingId.startsWith("temp_")) {
    return fail("이 지원자의 관리시트 레코드가 아직 없습니다. 지원자 화면에서 선정 상태를 다시 지정해주세요.");
  }
  const res = await runAction(async () => {
    const updated = await updateSeedingRecord(params.seedingId, params.patch);
    if (!updated) throw new Error("not found");
    return updated;
  });
  if (!res.ok) return res;
  revalidatePath(`/campaigns/${params.campaignId}`);
  revalidatePath(`/campaigns/${params.campaignId}/seeding-sheet`);
  revalidatePath("/");
  return res;
}
