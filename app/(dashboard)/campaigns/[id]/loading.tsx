import { SkeletonBlock, SkeletonCard, SkeletonHeader } from "@/components/Skeleton";

/** 캠페인 상세와 그 하위 화면(지원자, 관리시트, 보고서 등)의 로딩 화면. */
export default function CampaignLoading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중입니다</span>
      <SkeletonHeader />
      <div className="p-5 rounded-3xl bg-surface border border-border space-y-3">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-3 w-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
