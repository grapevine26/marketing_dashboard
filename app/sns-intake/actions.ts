"use server";

import { revalidatePath } from "next/cache";
import { saveSnsIntakeResponse, getSnsAccountByToken } from "@/lib/db";
import { assistSnsIntake } from "@/lib/ai/snsIntakeAssist";

export async function submitSnsIntakeAction(data: {
  token: string;
  accountId: string;
  answers: Record<string, string>;
}) {
  const account = await getSnsAccountByToken("intake", data.token);
  if (!account || account.id !== data.accountId) {
    throw new Error("유효하지 않은 설문 링크 토큰입니다.");
  }

  const response = await saveSnsIntakeResponse({
    account_id: data.accountId,
    answers: data.answers,
  });

  revalidatePath(`/sns-intake/${data.token}`);
  revalidatePath(`/sns/${data.accountId}`);
  return { success: true, response };
}

export async function assistSnsIntakeAction(request: {
  question: string;
  userDraft?: string;
  context?: {
    companyName?: string;
    platform?: string;
    handle?: string;
  };
}) {
  return await assistSnsIntake(request);
}