"use server";

import { createSnsPost, updateSnsPostStatus, updateSnsPost } from "@/lib/db";
import { SnsPost, SnsPostStatus } from "@/lib/db/types";
import { generateSnsCaption } from "@/lib/ai/snsCaptionAssist";
import { revalidatePath } from "next/cache";

export async function createSnsPostAction(params: {
  channel_id: string;
  scheduled_date: string;
  scheduled_time?: string;
  content_type: SnsPost["content_type"];
  title: string;
  visual_description: string;
  caption_copy: string;
  hashtags: string[];
}) {
  const post = await createSnsPost(params);
  revalidatePath("/sns");
  return { success: true, post };
}

export async function updatePostStatusAction(params: {
  postId: string;
  status: SnsPostStatus;
  clientFeedback?: string | null;
}) {
  const post = await updateSnsPostStatus(params.postId, params.status, params.clientFeedback);
  revalidatePath("/sns");
  return { success: true, post };
}

export async function generateAiCaptionAction(params: {
  brandName: string;
  contentType: string;
  topicTitle: string;
  visualDescription: string;
  platform?: string;
}) {
  return await generateSnsCaption(params);
}