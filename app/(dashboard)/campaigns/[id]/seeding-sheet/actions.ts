"use server";

// 규칙: 액션 본문 첫 문장은 `return runAuthedAction(...)`. 존재 확인·DB 조회를 그 앞에서 하면 인증 전에 실행된다.

import { updateSeedingRecord, ValidationError } from "@/lib/db";
import { ProgressStage, SeedingRecord } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";

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
  return runAuthedAction(async () => {
    if (params.seedingId.startsWith("temp_")) {
      throw new ValidationError("이 지원자의 관리시트 레코드가 아직 없습니다. 지원자 화면에서 선정 상태를 다시 지정해주세요.");
    }
    const updated = await updateSeedingRecord(params.seedingId, params.patch);
    if (!updated) throw new ValidationError("시딩 기록이 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.");
    revalidatePath(`/campaigns/${params.campaignId}`);
    revalidatePath(`/campaigns/${params.campaignId}/seeding-sheet`);
    revalidatePath("/");
    return updated;
  });
}
