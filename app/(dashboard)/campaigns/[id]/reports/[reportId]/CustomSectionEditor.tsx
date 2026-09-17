"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomSection } from "@/lib/db/types";
import { saveReportSectionsAction } from "../actions";
import { Plus, Trash2, Save, CheckCircle2, Loader2 } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import { useReportLock } from "./ReportLock";

export default function CustomSectionEditor({
  reportId,
  campaignId,
  initialSections,
}: {
  reportId: string;
  campaignId: string;
  initialSections: CustomSection[];
}) {
  const [sections, setSections] = useState<CustomSection[]>(initialSections);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 낙관적 잠금 기준. 저장에 성공할 때마다 새 값으로 옮긴다.
   * 안 옮기면 **연달아 저장할 때 자기 자신과 충돌**한다.
   *
   * 제목 편집기와 **같은 값을 본다**(ReportLock.tsx). 둘 다 `reports` 의 같은 행을 고치므로
   * 따로 들고 있으면 제목을 바꾼 직후 여기서 가짜 충돌이 난다.
   */
  const { baseline, setBaseline } = useReportLock();
  /**
   * 저장하려는데 그 사이 남이 먼저 저장한 상태.
   *
   * 토스트만 띄우면 막다른 길이 된다 — 사용자는 자기 글을 손에 쥔 채 무엇을 해야 할지 모른다.
   * 선택지를 화면에 남긴다. (SNS 콘텐츠 수정 모달과 같은 방식)
   */
  const [saveConflict, setSaveConflict] = useState(false);
  const router = useRouter();

  const update = (id: string, patch: Partial<CustomSection>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const handleAdd = () => {
    setSections((prev) => [
      ...prev,
      { id: `sec_${Date.now()}`, title: "새 섹션 제목", content: "" },
    ]);
  };

  const handleRemove = (id: string) => {
    // 10,000자짜리 총평 옆의 휴지통을 잘못 누르면 그 자리에서 사라지고, 습관적으로 저장을
    // 누르면 DB 에서도 사라진다. 되돌릴 방법이 없어서 한 번 묻는다.
    const target = sections.find((s) => s.id === id);
    const 이름 = target?.title?.trim() || "제목 없는 섹션";
    const 내용있음 = Boolean(target?.content?.trim());
    if (내용있음 && !confirm(`"${이름}" 섹션을 지울까요? 작성한 내용이 함께 사라집니다.`)) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await safeCall(
      saveReportSectionsAction({ reportId, campaignId, customSections: sections, expectedUpdatedAt: baseline })
    );
    setSaving(false);
    if (!res.ok) {
      // 충돌은 실패와 다르다. 내 글은 멀쩡하고, 무엇을 할지 고르기만 하면 된다.
      if ((res.error || "").includes("먼저 저장했습니다")) {
        setSaveConflict(true);
        setError(null);
        return;
      }
      setError(res.error);
      toast.error(res.error || "섹션 저장에 실패했습니다.");
      return;
    }
    setSaveConflict(false);
    setBaseline(res.data.updatedAt);
    setSaved(true);
    toast.success("보고서 맞춤 섹션이 저장되었습니다.");
    // 이모지는 PDF 글꼴에 글리프가 없어 **빈칸으로 나간다**(lib/reports/pdf.ts).
    // 방금 쓴 사람이 화면 앞에 있는 지금이 알리기 가장 좋은 때다 — 다운로드 순간에는
    // 응답이 파일이라 말을 붙일 자리가 없고, 받는 사람은 왜 문장이 어색한지 알 수 없다.
    // 막지는 않는다. 화면과 PPTX 에는 그대로 나오고, 이모지를 쓸지는 작성자가 정할 일이다.
    if (res.data.pdfEmojiCount > 0) {
      toast.warning(`이모지 ${res.data.pdfEmojiCount}자는 PDF 에서 빠집니다.`, {
        description: "PDF 한글 글꼴에 이모지 글자가 없어 빈칸으로 나갑니다. 화면과 PPTX 에는 그대로 나옵니다.",
      });
    }
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-8 rounded-3xl bg-surface border border-border space-y-6 shadow-xl font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text">결과보고서 커스텀 총평 및 하이라이트 편집</h2>
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text text-xs font-semibold inline-flex items-center gap-1 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>섹션 추가</span>
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}

      {saveConflict && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-warn-soft text-xs space-y-2">
          <p className="font-semibold">내가 이 화면을 연 뒤에 다른 사람이 먼저 저장했습니다.</p>
          <p className="text-[11px] leading-relaxed">
            지금 화면의 내용은 그대로 있습니다. 그대로 저장하면 그 사람의 수정을 덮어씁니다.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                // 기준 시각을 버리고 다시 저장한다 = 덮어쓰기. 사고가 아니라 **선택**이다.
                setBaseline(null);
                setSaveConflict(false);
                toast.info("다시 [보고서 내용 저장] 을 누르면 내 내용으로 덮어씁니다.");
              }}
              className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold transition"
            >
              내 내용으로 덮어쓰기
            </button>
            <button
              type="button"
              onClick={() => {
                setSaveConflict(false);
                router.refresh();
                toast.info("최신 내용을 불러왔습니다. 화면을 확인해주세요.");
              }}
              className="px-2 py-1 rounded-lg bg-surface2 hover:bg-surface3 text-text-sub transition"
            >
              최신 내용 불러오기 (내 수정 버림)
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {sections.length === 0 && (
          <div className="p-6 text-center text-text-muted text-xs border border-dashed border-border rounded-xl bg-bg">
            섹션이 없습니다. 섹션 추가 버튼으로 총평을 작성하세요.
          </div>
        )}
        {sections.map((sec) => (
          <div key={sec.id} className="p-5 rounded-2xl bg-bg border border-border space-y-3">
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={sec.title}
                onChange={(e) => update(sec.id, { title: e.target.value })}
                className="px-3 py-1.5 rounded-lg bg-surface border border-border text-text text-xs font-bold focus:outline-none focus:border-blue-500 w-2/3"
              />
              <button type="button" onClick={() => handleRemove(sec.id)} className="p-1 text-text-muted hover:text-red-400 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={4}
              value={sec.content}
              onChange={(e) => update(sec.id, { content: e.target.value })}
              placeholder="내용을 입력하세요..."
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
            />
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-border flex items-center justify-between">
        <div>
          {saved && (
            <span className="text-xs text-blue-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> 저장되었습니다!
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>보고서 내용 저장</span>
        </button>
      </div>
    </div>
  );
}
