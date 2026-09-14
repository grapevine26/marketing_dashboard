import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "로그인 | RB Global",
};

export const revalidate = 0;

/**
 * 로그인 화면. 사이드바 없는 전체 화면이다(대시보드 레이아웃 밖에 있어서 자동으로 그렇다).
 *
 * `?next=` 는 프록시가 붙여준다. 로그인하지 않은 채 대시보드로 들어오면 프록시가 원래
 * 가려던 경로를 여기에 실어 보낸다. 값 검사는 서버 액션에서 한다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  // 같은 키가 여러 번 오면 배열이 된다. 첫 값만 쓴다.
  const nextPath = Array.isArray(next) ? next[0] : next;

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center py-8 px-3 sm:p-6 font-sans">
      <LoginClient next={nextPath ?? null} />
    </div>
  );
}
