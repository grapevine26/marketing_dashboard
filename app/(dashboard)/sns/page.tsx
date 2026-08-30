import { getSnsChannels, getSnsPosts } from "@/lib/db";
import SnsCalendarView from "./SnsCalendarView";
import NewPostModal from "./NewPostModal";
import { Share2, Camera, Video, Sparkles } from "lucide-react";

export const revalidate = 0;

export default async function SnsManagementPage() {
  const [channels, posts] = await Promise.all([
    getSnsChannels(),
    getSnsPosts(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Camera className="w-6 h-6 text-pink-400" />
            <span>SNS 채널 운영 & 콘텐츠 캘린더</span>
          </h1>
          <p className="text-sm text-slate-400">
            브랜드 공식 SNS 채널의 콘텐츠 기획(Gemini AI 캡션 생성), 발행 스케줄 및 광고주 실시간 검수/승인을 관리합니다.
          </p>
        </div>

        <NewPostModal channels={channels} />
      </div>

      <SnsCalendarView channels={channels} initialPosts={posts} />
    </div>
  );
}