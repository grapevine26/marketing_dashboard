"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSnsAccountAction } from "./actions";
import { SnsPlatform } from "@/lib/db/types";
import { Plus, X, Loader2 } from "lucide-react";

export default function NewSnsAccountModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  const [formData, setFormData] = useState({
    company_name: "",
    platform: "instagram" as SnsPlatform,
    handle: "",
    starts_on: "",
    ends_on: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name.trim() || !formData.handle.trim()) {
      setErrorMsg("브랜드명과 계정 핸들을 입력해주세요.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    const res = await createSnsAccountAction({
      company_name: formData.company_name.trim(),
      platform: formData.platform,
      handle: formData.handle.trim().replace(/^@/, ""),
      starts_on: formData.starts_on || null,
      ends_on: formData.ends_on || null,
    });
    setLoading(false);
    if (!res.ok) {
      setErrorMsg(res.error);
      return;
    }
    setOpen(false);
    router.push(`/sns/${res.data.id}`);
  };

  const cls = "w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-sky-500";

  return (
    <>
      <button
        type="button"
        onClick={() => { setErrorMsg(null); setOpen(true); }}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold shadow-md transition active:scale-95"
      >
        <Plus className="w-4 h-4" />
        <span>새 계정 등록</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-surface border-t sm:border border-border rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h2 className="text-base font-bold text-text">신규 SNS 대행 계정 등록</h2>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-text-sub hover:text-text transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{errorMsg}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-2">브랜드 / 업체명 *</label>
                <input type="text" required value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} placeholder="예: 글로우랩 코스메틱" className={cls} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-2">운영 플랫폼 *</label>
                  <select value={formData.platform} onChange={(e) => setFormData({ ...formData, platform: e.target.value as SnsPlatform })} className={`${cls} font-semibold`}>
                    <option value="instagram">인스타그램 (Instagram)</option>
                    <option value="youtube">유튜브 (YouTube)</option>
                    <option value="tiktok">틱톡 (TikTok)</option>
                    <option value="other">기타 채널</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-2">계정 핸들 (@ID) *</label>
                  <input type="text" required value={formData.handle} onChange={(e) => setFormData({ ...formData, handle: e.target.value })} placeholder="glowlab_official" className={`${cls} font-mono`} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-2">대행 계약 시작일</label>
                  <input type="date" value={formData.starts_on} onChange={(e) => setFormData({ ...formData, starts_on: e.target.value })} className={cls} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-2">대행 계약 종료일</label>
                  <input type="date" value={formData.ends_on} onChange={(e) => setFormData({ ...formData, ends_on: e.target.value })} className={cls} />
                </div>
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-medium">취소</button>
                <button type="submit" disabled={loading} className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>계정 등록하기</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
