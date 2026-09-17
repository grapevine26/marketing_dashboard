"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import { deleteReportAction } from "./actions";

/**
 * 보고서 삭제 버튼. 목록 카드와 상세 화면이 함께 쓴다.
 *
 * **확인 방식** — 이 저장소에는 두 가지가 있다: 체크리스트·행사처럼 `confirm` 한 번,
 * 캠페인처럼 이름을 받아쓰게 하기. 보고서는 앞쪽으로 충분하다 — 지워도 캠페인 데이터는
 * 그대로고 [보고서 생성]으로 다시 만들 수 있다. 잃는 것은 그때 찍힌 숫자와 써 둔 총평이라,
 * 확인 문구에 그 둘을 적어 둔다.
 */
export default function DeleteReportButton({
  reportId,
  campaignId,
  title,
  hasSections,
  redirectToList = false,
  className,
  label = "삭제",
}: {
  reportId: string;
  campaignId: string;
  title: string;
  /** 써 둔 총평이 있는가. 확인 문구에서 "무엇을 잃는지" 를 정확히 말하려고 받는다. */
  hasSections?: boolean;
  /** 상세 화면에서 지우면 그 화면 자체가 사라진다. 목록으로 보낸다. */
  redirectToList?: boolean;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    const 잃는것 = hasSections ? "저장된 지표 스냅샷과 써 둔 총평이" : "저장된 지표 스냅샷이";
    if (!confirm(`"${title}" 보고서를 삭제할까요? ${잃는것} 함께 사라지고 되돌릴 수 없습니다.`)) return;

    setBusy(true);
    const res = await safeCall(deleteReportAction({ reportId, campaignId }));
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error || "보고서 삭제에 실패했습니다.");
      return;
    }
    toast.success(`"${title}" 보고서를 삭제했습니다.`);
    // 상세 화면이면 지금 보고 있는 것이 사라졌으므로 목록으로 보낸다.
    // 목록이면 제자리에서 다시 불러온다(버튼은 계속 잠근 채로 — 카드가 곧 사라진다).
    if (redirectToList) router.replace(`/campaigns/${campaignId}/reports`);
    else router.refresh();
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleDelete}
      className={
        className ||
        "px-3 py-1.5 rounded-lg bg-surface2 hover:bg-red-500/10 text-text-sub hover:text-red-400 text-xs font-semibold inline-flex items-center gap-1 transition disabled:opacity-50"
      }
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      <span>{label}</span>
    </button>
  );
}
