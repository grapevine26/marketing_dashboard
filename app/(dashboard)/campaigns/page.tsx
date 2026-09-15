import { getCampaigns } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isManager } from "@/lib/auth/roles";
import CampaignsListClient from "./CampaignsListClient";

export const revalidate = 0;

export default async function CampaignsPage() {
  const [campaigns, user] = await Promise.all([getCampaigns(), getCurrentUser()]);
  // 삭제는 관리자만 할 수 있다(actions.ts 의 deleteCampaignAction). 그 사실을 화면도 알아야
  // 직원에게 삭제 버튼을 아예 안 보여줄 수 있다. 전에는 캠페인 이름을 다 옮겨 적고
  // 버튼을 누른 뒤에야 "관리자만 할 수 있습니다" 를 봤다.
  // **이건 편의일 뿐 방어가 아니다.** 진짜 방어는 서버 액션에 그대로 있다.
  return <CampaignsListClient initialCampaigns={campaigns} canDelete={isManager(user?.role ?? "staff")} />;
}
