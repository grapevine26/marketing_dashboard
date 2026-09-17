"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import { renameReportAction } from "../actions";
import { useReportLock } from "./ReportLock";

/**
 * 보고서 제목과 그 자리에서의 이름 바꾸기.
 *
 * **왜 필요한가** — 제목은 늘 "{캠페인명} 결과보고서" 였다. [보고서 생성]을 세 번 누르면
 * 구분할 수 없는 보고서 세 장이 쌓이고, 내려받은 PDF 파일 이름까지 겹쳐서 어느 것이 어느
 * 시점의 보고서인지 알 수 없었다. (중간보고 / 최종보고 / 광고주 제출용 처럼 붙일 수 있게 한다.)
 *
 * 기준 시각은 총평 편집기와 **공유한다**(ReportLock.tsx). 이유는 그 파일의 주석에 있다.
 */
export default function ReportTitleEditor({
  reportId,
  campaignId,
  initialTitle,
}: {
  reportId: string;
  campaignId: string;
  initialTitle: string;
}) {
  const { baseline, setBaseline } = useReportLock();
  const [title, setTitle] = useState(initialTitle);
  const [draft, setDraft] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const open = () => {
    setDraft(title);
    setError(null);
    setConflict(false);
    setEditing(true);
  };

  const save = async () => {
    const next = draft.trim();
    if (!next) {
      setError("보고서 제목을 입력해주세요.");
      return;
    }
    if (next === title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await safeCall(
      renameReportAction({ reportId, campaignId, title: next, expectedUpdatedAt: baseline })
    );
    setSaving(false);
    if (!res.ok) {
      // 충돌은 실패와 다르다. 쓴 제목은 입력칸에 그대로 있고, 무엇을 할지 고르기만 하면 된다.
      if ((res.error || "").includes("먼저 저장했습니다")) {
        setConflict(true);
        return;
      }
      setError(res.error);
      return;
    }
    setTitle(res.data.title);
    // 저장에 성공했으면 기준 시각을 옮긴다. 총평 편집기도 같은 값을 본다.
    setBaseline(res.data.updatedAt);
    setEditing(false);
    setConflict(false);
    toast.success("보고서 제목을 바꿨습니다.");
    // 빵부스러기·브라우저 탭 제목·목록 카드는 서버가 그린다. 다시 불러와 맞춘다.
    router.refresh();
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-text tracking-tight">{title}</h1>
        <button
          type="button"
          onClick={open}
          aria-label="보고서 제목 바꾸기"
          title="보고서 제목 바꾸기"
          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface2 transition"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoFocus
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="px-3 py-1.5 rounded-lg bg-surface border border-border text-text text-lg font-bold focus:outline-none focus:border-blue-500 w-full max-w-md"
        />
        <button
          type="button"
          disabled={saving}
          onClick={save}
          aria-label="제목 저장"
          title="제목 저장"
          className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="제목 바꾸기 취소"
          title="취소"
          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface2 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {conflict && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-warn-soft text-[11px] space-y-1.5">
          <p className="font-semibold">내가 이 화면을 연 뒤에 다른 사람이 먼저 저장했습니다.</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                // 기준 시각을 버린다 = 덮어쓰기. 사고가 아니라 **선택**이다.
                // 총평 편집기도 같은 기준을 보므로, 이 선택은 그쪽에도 그대로 적용된다.
                setBaseline(null);
                setConflict(false);
                toast.info("다시 저장하면 내 내용으로 덮어씁니다.");
              }}
              className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold transition"
            >
              그래도 이 제목으로 바꾸기
            </button>
            <button
              type="button"
              onClick={() => {
                setConflict(false);
                setEditing(false);
                router.refresh();
                toast.info("최신 내용을 불러왔습니다. 화면을 확인해주세요.");
              }}
              className="px-2 py-1 rounded-lg bg-surface2 hover:bg-surface3 text-text-sub transition"
            >
              최신 내용 불러오기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
