import { SkeletonBlock, SkeletonHeader } from "@/components/Skeleton";

/** SNS 계정 관리 허브의 로딩 화면. 달력과 목록이 큰 면적을 차지한다. */
export default function SnsAccountLoading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중입니다</span>
      <SkeletonHeader />
      <div className="p-5 rounded-3xl bg-surface border border-border space-y-4">
        <SkeletonBlock className="h-4 w-32" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-14" />
          ))}
        </div>
      </div>
    </div>
  );
}
