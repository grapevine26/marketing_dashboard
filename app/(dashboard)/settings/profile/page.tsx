import { requireUser } from "@/lib/auth/session";
import { db, unwrapMaybe } from "@/lib/db/client";
import ProfileClient from "./ProfileClient";
import { UserCircle } from "lucide-react";

export const revalidate = 0;

/**
 * 내 정보. 로그인한 사람이면 누구나 자기 것을 본다.
 * 등급과 상태는 보여만 주고 바꾸지 못한다. 그건 관리자가 할 일이다.
 */
export default async function ProfilePage() {
  const me = await requireUser();

  const row = unwrapMaybe(
    await db()
      .from("profiles")
      .select("created_at, approved_at")
      .eq("id", me.id)
      .maybeSingle<{ created_at: string; approved_at: string | null }>()
  );

  return (
    <div className="space-y-6 max-w-2xl font-sans">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight flex items-center gap-2">
          <UserCircle className="w-6 h-6 text-accent2" />
          <span>내 정보</span>
        </h1>
        <p className="text-xs sm:text-sm text-text-sub">
          이름과 비밀번호를 바꿀 수 있습니다. 등급과 상태는 관리자가 정합니다.
        </p>
      </div>

      <ProfileClient
        me={me}
        createdAt={row?.created_at ?? null}
        approvedAt={row?.approved_at ?? null}
      />
    </div>
  );
}
