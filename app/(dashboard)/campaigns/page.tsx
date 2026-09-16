import { getCampaigns, countApplicantsByCampaign } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isManager } from "@/lib/auth/roles";
import CampaignsListClient from "./CampaignsListClient";

export const revalidate = 0;

export default async function CampaignsPage() {
  const [campaigns, user, counts] = await Promise.all([
    getCampaigns(),
    getCurrentUser(),
    // 지원자 수는 오버뷰 맨 아래 박스에만 있었는데 그 박스를 없앴다. 원래 여기 있어야 할
    // 정보라 옮긴다. 조회는 한 번이고 campaign_id·status 두 칸만 받는다(개인정보를 끌어오지 않는다).
    countApplicantsByCampaign().catch(() => new Map()),
  ]);
  // Map 은 클라이언트 경계를 넘길 때 다루기 까다롭다. 평범한 객체로 바꿔 보낸다.
  const applicantCounts = Object.fromEntries(counts);
  // 삭제는 관리자만 할 수 있다(actions.ts 의 deleteCampaignAction). 그 사실을 화면도 알아야
  // 직원에게 삭제 버튼을 아예 안 보여줄 수 있다. 전에는 캠페인 이름을 다 옮겨 적고
  // 버튼을 누른 뒤에야 "관리자만 할 수 있습니다" 를 봤다.
  // **이건 편의일 뿐 방어가 아니다.** 진짜 방어는 서버 액션에 그대로 있다.
  return (
    <CampaignsListClient
      initialCampaigns={campaigns}
      canDelete={isManager(user?.role ?? "staff")}
      applicantCounts={applicantCounts}
    />
  );
}
