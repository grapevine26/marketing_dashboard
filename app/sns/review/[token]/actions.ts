"use server";

import { getSnsPostByToken, updateSnsPostStatus } from "@/lib/db";
import { SnsPostStatus } from "@/lib/db/types";

export async function submitClientReviewAction(params: {
  token: string;
  status: SnsPostStatus;
  feedback?: string;
}) {
  const post = await getSnsPostByToken(params.token);
  if (!post) throw new Error("Invalid review token");

  const updated = await updateSnsPostStatus(post.id, params.status, params.feedback || null);
  return { success: true, post: updated };
}