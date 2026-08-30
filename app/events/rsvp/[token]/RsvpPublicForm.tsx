"use client";

import { useState } from "react";
import { MarketingEvent, EventRsvpStatus } from "@/lib/db/types";
import { submitRsvpAction } from "./actions";
import { CheckCircle2, Send, Loader2 } from "lucide-react";

export default function RsvpPublicForm({ event }: { event: MarketingEvent }) {
  const [formData, setFormData] = useState({
    name: "",
    sns_link: "",
    contact: "",
    rsvp_status: "attending" as EventRsvpStatus,
    party_size: 1,
    notes: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitRsvpAction({
        token: event.rsvp_token,
        ...formData,
      });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="py-6 space-y-2 text-center font-sans">
        <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-zinc-100">
          {formData.rsvp_status === "attending" ? "참석 회신이 완료되었습니다!" : "회신이 완료되었습니다."}
        </h3>
        <p className="text-xs text-zinc-400">
          행사 당일 현장 안내 데스크에서 성함을 말씀해 주시면 빠른 입장이 가능합니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left font-sans">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-300">참석 여부 선택 *</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFormData({ ...formData, rsvp_status: "attending" })}
            className={`py-3 sm:py-2 rounded-xl text-xs font-bold transition border active:scale-95 ${
              formData.rsvp_status === "attending"
                ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                : "bg-[#090A0C] border-[#22242A] text-zinc-400"
            }`}
          >
            참석하겠습니다 ✓
          </button>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, rsvp_status: "declined" })}
            className={`py-3 sm:py-2 rounded-xl text-xs font-medium transition border active:scale-95 ${
              formData.rsvp_status === "declined"
                ? "bg-red-600 border-red-500 text-white"
                : "bg-[#090A0C] border-[#22242A] text-zinc-400"
            }`}
          >
            아쉽지만 불참합니다
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">성함 / 활동명 *</label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="홍길동"
          className="w-full px-3 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">활동 SNS 계정 링크 *</label>
        <input
          type="url"
          required
          value={formData.sns_link}
          onChange={(e) => setFormData({ ...formData, sns_link: e.target.value })}
          placeholder="https://instagram.com/your_id"
          className="w-full px-3 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">연락처 *</label>
          <input
            type="tel"
            required
            value={formData.contact}
            onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
            placeholder="010-1234-5678"
            className="w-full px-3 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">동반 인원 (본인포함)</label>
          <input
            type="number"
            min={1}
            max={5}
            value={formData.party_size}
            onChange={(e) => setFormData({ ...formData, party_size: Number(e.target.value) })}
            className="w-full px-3 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3.5 sm:py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-500/25 transition disabled:opacity-50 inline-flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        <span>RSVP 회신 제출하기</span>
      </button>
    </form>
  );
}