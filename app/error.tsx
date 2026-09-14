"use client"; // 오류 경계는 클라이언트 컴포넌트여야 한다(Next 규약).

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * 화면을 그리다 예기치 못한 오류가 났을 때 보이는 화면.
 *
 * 기본 영문 화면 대신 한국어로 무엇을 하면 되는지 알려준다. 오류 내용은 보여주지 않는다.
 * 운영 빌드에서는 서버 오류 메시지가 가려져 어차피 알맹이가 없고, 직원에게는 "담당자에게 알려라"가 더 쓸모 있다.
 *
 * `retry` 는 데이터를 다시 받아 자식을 다시 그린다. 일시적인 네트워크·DB 오류면 이걸로 풀린다.
 * (`reset` 은 다시 받지 않고 상태만 지우므로 같은 오류가 그대로 반복될 수 있어 쓰지 않는다.)
 * 루트 layout 자체의 오류는 여기서 못 잡는다. 그건 global-error 몫인데, 루트 layout 은 정적이라 두지 않았다.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // 서버 로그와 맞춰 볼 수 있도록 digest 를 함께 남긴다.
    console.error("[화면 오류]", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md p-8 rounded-3xl bg-surface border border-border text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-rose-400" />
        </div>
        <h1 className="text-lg font-bold text-text">문제가 생겼습니다</h1>
        <p className="text-sm text-text-sub leading-relaxed">
          새로고침해도 반복되면 담당자에게 알려주세요.
          {error.digest && (
            <>
              <br />
              <span className="text-[11px] font-mono text-text-muted">오류 번호 {error.digest}</span>
            </>
          )}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-block px-4 py-2 rounded-xl bg-accent text-accent-on text-xs font-bold hover:opacity-90 transition"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-xl bg-surface2 border border-border text-xs font-bold text-text hover:bg-surface3 transition"
          >
            첫 화면으로
          </Link>
        </div>
      </div>
    </main>
  );
}
