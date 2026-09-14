import { requireOwner } from "@/lib/auth/session";
import { queryAuditLogs } from "@/lib/db/audit";
import { getCampaigns, getSnsAccounts } from "@/lib/db";
import ActivityClient from "./ActivityClient";

export const revalidate = 0;

/**
 * 전체 활동 기록. 대표 관리자 전용.
 *
 * 첫 쪽만 서버에서 그려 내려주고, 그 뒤 거르기와 더 보기는 서버 액션으로 받는다.
 * 캠페인·계정 이름은 로그에 없고 id 만 있어서, 이름표를 함께 넘겨 화면에서 붙인다.
 */
export default async function ActivityPage() {
  await requireOwner();

  const [{ rows, hasMore }, campaigns, accounts] = await Promise.all([
    queryAuditLogs({ limit: 50 }),
    getCampaigns(),
    getSnsAccounts(),
  ]);

  const names: Record<string, string> = {};
  for (const c of campaigns) names[c.id] = c.name;
  for (const a of accounts) names[a.id] = `${a.company_name} (@${a.handle})`;

  return <ActivityClient initialRows={rows} initialHasMore={hasMore} names={names} />;
}
