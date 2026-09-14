/**
 * 초대 링크의 값과 모양만 담는다. **서버 전용이 아니다.**
 *
 * 화면(UsersClient)도 이 값이 필요한데, `invites.ts` 는 DB 에 닿아서 `server-only` 다.
 * 클라이언트 컴포넌트가 그걸 가져오면 빌드가 깨진다(등급 정의를 roles.ts 로 뺀 것과 같은 이유).
 * 그래서 순수한 값만 여기 두고, 서버 쪽은 여기서 가져다 쓴다.
 */

/** 링크가 살아 있는 시간. 사흘이면 "오늘 밤에 할게요"를 넉넉히 덮는다. */
export const INVITE_TTL_HOURS = 72;

/** 화면이 다루는 초대 한 건. 토큰은 주소를 만들 때 쓴다. */
export interface SignupInvite {
  token: string;
  label: string | null;
  created_by_name: string;
  expires_at: string;
  created_at: string;
}
