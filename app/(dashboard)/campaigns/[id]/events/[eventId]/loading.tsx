import { SkeletonBlock, SkeletonHeader } from "@/components/Skeleton";

/** 행사 상세의 로딩 화면. 초대자 표가 큰 면적을 차지한다. */
export default function EventLoading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중입니다</span>
      <SkeletonHeader />
      <div className="rounded-3xl bg-surface border border-border divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-3">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-4 flex-1" />
            <SkeletonBlock className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
