import Link from "next/link";
import { Link2Off } from "lucide-react";

/**
 * 없는 주소를 열었을 때. 대개는 재발급되어 막힌 옛 공유 링크를 광고주나 인플루언서가 연 경우다.
 * 영문 기본 화면 대신, 누구에게 새 링크를 받아야 하는지 알려준다.
 */
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md p-8 rounded-3xl bg-surface border border-border text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-surface2 border border-border flex items-center justify-center">
          <Link2Off className="w-6 h-6 text-text-sub" />
        </div>
        <h1 className="text-lg font-bold text-text">열 수 없는 주소입니다</h1>
        <p className="text-sm text-text-sub leading-relaxed">
          링크가 만료되었거나 주소가 잘못되었습니다. 공유받은 링크라면 담당자에게 새 링크를 요청해주세요.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 rounded-xl bg-surface2 border border-border text-xs font-bold text-text hover:bg-surface3 transition"
        >
          첫 화면으로
        </Link>
      </div>
    </main>
  );
}
