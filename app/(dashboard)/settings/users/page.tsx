import { requireAdmin } from "@/lib/auth/session";
import { getUsers } from "@/lib/auth/users";
import { listOpenInvites } from "@/lib/auth/invites";
import UsersClient from "./UsersClient";
import { Users } from "lucide-react";

// 승인·차단이 바로 반영돼야 하는 화면이라 캐시하지 않는다.
export const revalidate = 0;

export default async function UsersSettingsPage() {
  // 관리자만 통과한다. 아니면 requireAdmin 이 알맞은 화면으로 보낸다.
  const admin = await requireAdmin();
  const users = await getUsers();
  // 초대 링크는 대표 관리자에게만 보낸다. 토큰 자체가 가입 권한이라
  // 관리자 화면의 HTML 에 값이 실리지 않게 서버에서 잘라낸다.
  const invites = admin.role === "owner" ? await listOpenInvites() : [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight flex items-center gap-2">
          <Users className="w-6 h-6 text-accent2" />
          <span>사용자 관리</span>
        </h1>
        <p className="text-xs sm:text-sm text-text-sub">
          가입 신청을 승인하거나 거절하고, 계정의 권한·상태·비밀번호를 관리합니다.
        </p>
      </div>

      {/* 자기 자신을 구분하려면 id 가, 어떤 버튼을 보일지 정하려면 내 등급이 필요하다.
          관리자는 직원만 관리한다. 서버도 막지만 화면에서도 안 보이는 편이 낫다. */}
      <UsersClient
        initialUsers={users}
        currentUserId={admin.id}
        myRole={admin.role}
        invites={invites}
      />
    </div>
  );
}
