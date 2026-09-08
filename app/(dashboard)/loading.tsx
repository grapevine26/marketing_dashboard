import { SkeletonPage } from "@/components/Skeleton";

/**
 * 대시보드 전체의 기본 로딩 화면.
 * 형제 페이지끼리 이동할 때(오버뷰 <-> 캠페인 <-> SNS 등) 이 경계가 쓰인다.
 */
export default function DashboardLoading() {
  return <SkeletonPage />;
}
