import { notFound } from "next/navigation";
import { getSnsPostByToken, getSnsChannels } from "@/lib/db";
import ReviewPublicView from "./ReviewPublicView";
import { Camera, Calendar, CheckCircle2 } from "lucide-react";

export const revalidate = 0;

export default async function SnsReviewPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const post = await getSnsPostByToken(token);
  if (!post) notFound();

  const channels = await getSnsChannels();
  const channel = channels.find((c) => c.id === post.channel_id);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 flex flex-col items-center justify-center">
      <div className="max-w-xl w-full space-y-6">
        <div className="text-center space-y-2">
          <span className="px-3 py-1 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20 text-xs font-semibold">
            {channel?.company_name} • SNS 콘텐츠 시안 검수
          </span>
          <h1 className="text-2xl font-extrabold text-white">{post.title}</h1>
          <p className="text-xs text-slate-400">
            발행 예정 일자: {post.scheduled_date} {post.scheduled_time} ({channel?.name} @{channel?.handle})
          </p>
        </div>

        <ReviewPublicView post={post} />
      </div>
    </div>
  );
}