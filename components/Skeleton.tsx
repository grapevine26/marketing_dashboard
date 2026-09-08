/**
 * 화면 전환 중에 잠깐 보여주는 골격.
 *
 * 이게 없으면 Next 는 서버 렌더가 끝날 때까지 화면 전환 자체를 미룬다.
 * 그동안 이전 페이지가 그대로 남아 있어서 버튼이 안 먹은 것처럼 느껴진다.
 * 내용을 맞히는 게 목적이 아니라, 누른 즉시 반응이 있다는 걸 보여주는 게 목적이다.
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface2 ${className}`} />;
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`p-5 rounded-2xl bg-surface border border-border space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-8 w-8 rounded-xl" />
        <SkeletonBlock className="h-3 w-16" />
      </div>
      <SkeletonBlock className="h-4 w-2/3" />
      <SkeletonBlock className="h-3 w-full" />
      <div className="pt-2 border-t border-border">
        <SkeletonBlock className="h-3 w-24" />
      </div>
    </div>
  );
}

/** 페이지 상단 제목 줄. */
export function SkeletonHeader() {
  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-border space-y-3">
      <SkeletonBlock className="h-5 w-48" />
      <SkeletonBlock className="h-3 w-72 max-w-full" />
    </div>
  );
}

export function SkeletonPage({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중입니다</span>
      <SkeletonHeader />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
