import { CalendarX2 } from "lucide-react";

/**
 * 끝난 캠페인·계약의 공개 링크를 열었을 때 보여주는 화면.
 *
 * 링크 자체는 살아 있지만 대상이 끝났으므로 내용은 보여주지 않는다. 끝난 뒤에도 옛 카톡방의
 * 링크가 고객사 데이터를 계속 내보내는 상태를 막는 것이 목적이다.
 *
 * 404 대신 이 화면을 쓴다. 광고주 입장에서 "주소가 틀렸나"와 "끝나서 닫혔나"는 다른 상황이고,
 * 다시 봐야 한다면 누구에게 말해야 하는지 알려줘야 한다.
 */
export default function ClosedLinkNotice({ what }: { what: string }) {
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm p-8 rounded-3xl bg-surface border border-border text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-surface2 border border-border flex items-center justify-center">
          <CalendarX2 className="w-6 h-6 text-text-sub" />
        </div>
        <h1 className="text-lg font-bold text-text">종료된 {what}입니다</h1>
        <p className="text-sm text-text-sub leading-relaxed">
          이 링크는 더 이상 열리지 않습니다. 내용을 다시 확인해야 한다면 담당자에게 요청해주세요.
        </p>
      </div>
    </div>
  );
}
