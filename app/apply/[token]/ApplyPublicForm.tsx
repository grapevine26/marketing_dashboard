"use client";

import { useState } from "react";
import { Campaign, CampaignFormConfig } from "@/lib/db/types";
import { submitApplicantAction } from "./actions";
import { Send, CheckCircle2, Loader2 } from "lucide-react";

export default function ApplyPublicForm({
  campaign,
  formConfig,
}: {
  campaign: Campaign;
  formConfig: CampaignFormConfig | null;
}) {
  const isShipping = campaign.campaign_type === "shipping";

  const [formData, setFormData] = useState({
    name: "",
    sns_link: "",
    nationality: "대한민국",
    contact: "",
    shipping_address: "",
    visit_schedule: "",
    visit_party_size: 1,
    custom_answers: {} as Record<string, any>,
    privacy_agreed: false,
    secondary_use_agreed: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.privacy_agreed) {
      alert("개인정보 수집 및 이용에 동의해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await submitApplicantAction({
        token: campaign.apply_form_token,
        ...formData,
      });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-8 rounded-3xl bg-[#131418] border border-[#22242A] text-center space-y-3 shadow-2xl font-sans">
        <div className="w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-zinc-100">지원이 성공적으로 완료되었습니다!</h2>
        <p className="text-xs text-zinc-400">
          선정되신 분들께는 기재해주신 연락처로 개별 안내 메시지를 발송해 드립니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 shadow-2xl font-sans">
      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">성함 / 활동명 *</label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="홍길동"
          className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">활동 SNS 계정 URL *</label>
        <input
          type="url"
          required
          value={formData.sns_link}
          onChange={(e) => setFormData({ ...formData, sns_link: e.target.value })}
          placeholder="https://instagram.com/your_id"
          className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">연락처 *</label>
          <input
            type="tel"
            required
            value={formData.contact}
            onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
            placeholder="010-1234-5678"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">국적 *</label>
          <input
            type="text"
            required
            value={formData.nationality}
            onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {isShipping ? (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">배송지 주소 (상세주소 포함) *</label>
          <input
            type="text"
            required
            value={formData.shipping_address}
            onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })}
            placeholder="서울특별시 강남구 테헤란로 123 401호"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">방문 희망 일정 *</label>
            <input
              type="text"
              required
              value={formData.visit_schedule}
              onChange={(e) => setFormData({ ...formData, visit_schedule: e.target.value })}
              placeholder="예: 9월 10일 오후 3시"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">방문 인원수</label>
            <input
              type="number"
              min={1}
              max={5}
              value={formData.visit_party_size}
              onChange={(e) =>
                setFormData({ ...formData, visit_party_size: Number(e.target.value) })
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {formConfig?.custom_questions && formConfig.custom_questions.length > 0 && (
        <div className="pt-2 border-t border-[#22242A] space-y-3">
          {formConfig.custom_questions.map((q) => (
            <div key={q.id} className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">
                {q.label} {q.required && <span className="text-blue-400">*</span>}
              </label>
              <input
                type="text"
                required={q.required}
                value={formData.custom_answers[q.id] || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    custom_answers: { ...formData.custom_answers, [q.id]: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-[#22242A] space-y-2 text-xs text-zinc-400">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            required
            checked={formData.privacy_agreed}
            onChange={(e) => setFormData({ ...formData, privacy_agreed: e.target.checked })}
            className="accent-blue-600"
          />
          <span>(필수) 개인정보 수집 및 리워드 배송/일정 안내를 위한 이용에 동의합니다.</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.secondary_use_agreed}
            onChange={(e) =>
              setFormData({ ...formData, secondary_use_agreed: e.target.checked })
            }
            className="accent-blue-600"
          />
          <span>(선택) 제작된 콘텐츠의 브랜드 2차 마케팅 활용에 동의합니다.</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        <span>인플루언서 지원서 제출하기</span>
      </button>
    </form>
  );
}