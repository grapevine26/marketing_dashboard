"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSnsAccountAction } from "./actions";
import { SnsPlatform } from "@/lib/db/types";
import { Plus, X, Loader2 } from "lucide-react";

export default function NewSnsAccountModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    try {
      const res = await createSnsAccountAction({
        company_name: formData.company_name,
        platform: formData.platform,
        handle: formData.handle.replace(/^@/, ""),
        starts_on: formData.starts_on || null,
        ends_on: formData.ends_on || null,
      });
      setOpen(false);
      router.push(`/sns/${res.account.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold shadow-md transition active:scale-95"
      >
        <Plus className="w-4 h-4" />
        <span>새 계정 등록</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-[#131418] border-t sm:border border-[#22242A] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#22242A]">
              <h2 className="text-base font-bold text-zinc-100">신규 SNS 대행 계정 등록</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">브랜드 / 업체명 *</label>
                <input
                  type="text"
                  required
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  placeholder="예: 글로우랩 코스메틱"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">운영 플랫폼 *</label>
                  <select
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value as SnsPlatform })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500 font-semibold uppercase"
                  >
                    <option value="instagram">인스타그램 (Instagram)</option>
                    <option value="youtube">유튜브 (YouTube)</option>
                    <option value="tiktok">틱톡 (TikTok)</option>
                    <option value="other">기타 채널</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">계정 핸들 (@ID) *</label>
                  <input
                    type="text"
                    required
                    value={formData.handle}
                    onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
                    placeholder="glowlab_official"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">대행 계약 시작일</label>
                  <input
                    type="date"
                    value={formData.starts_on}
                    onChange={(e) => setFormData({ ...formData, starts_on: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">대행 계약 종료일</label>
                  <input
                    type="date"
                    value={formData.ends_on}
                    onChange={(e) => setFormData({ ...formData, ends_on: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-300 text-xs font-medium"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
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