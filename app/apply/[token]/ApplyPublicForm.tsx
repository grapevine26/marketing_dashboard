"use client";

import { useState } from "react";
import { Campaign, CustomQuestion } from "@/lib/db/types";
import { submitApplicantAction } from "./actions";
import { Send, CheckCircle2, Loader2, User, Link2, Globe, Phone, MapPin, Calendar, CheckSquare } from "lucide-react";

export default function ApplyPublicForm({
  campaign,
  customQuestions,
}: {
  campaign: Campaign;
  customQuestions: CustomQuestion[];
}) {
  const [formData, setFormData] = useState({
    name: "",
    sns_link: "",
    nationality: "대한민국",
    contact: "",
    shipping_address: "",
    visit_schedule: "",
    visit_party_size: 1,
    privacy_agreed: false,
    secondary_use_agreed: false,
  });

  const [customAnswers, setCustomAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.privacy_agreed || !formData.secondary_use_agreed) {
      alert("모든 필수 동의 항목에 동의해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await submitApplicantAction({
        token: campaign.apply_form_token,
        name: formData.name,
        sns_link: formData.sns_link,
        nationality: formData.nationality,
        contact: formData.contact,
        shipping_address:
          campaign.campaign_type === "shipping" ? formData.shipping_address : null,
        visit_schedule:
          campaign.campaign_type === "visit" ? formData.visit_schedule : null,
        visit_party_size:
          campaign.campaign_type === "visit" ? Number(formData.visit_party_size) : null,
        custom_answers: customAnswers,
        privacy_agreed: formData.privacy_agreed,
        secondary_use_agreed: formData.secondary_use_agreed,
      });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white">신청이 성공적으로 접수되었습니다!</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          지원해주셔서 감사합니다. 선정 결과는 기재해주신 연락처로 개별 안내해 드릴 예정입니다.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 shadow-2xl"
    >
      <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
        기본 지원자 정보
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-300">
            이름 / 닉네임 <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="홍길동"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
            />
            <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-300">
            연락처 (휴대폰 번호) <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type="tel"
              required
              value={formData.contact}
              onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
              placeholder="010-1234-5678"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
            />
            <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-300">
            활동 SNS 프로필 링크 <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type="url"
              required
              value={formData.sns_link}
              onChange={(e) => setFormData({ ...formData, sns_link: e.target.value })}
              placeholder="https://instagram.com/your_id"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
            />
            <Link2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-300">
            국적 <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={formData.nationality}
              onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
              placeholder="대한민국"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
            />
            <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          </div>
        </div>
      </div>

      {/* Type Specific Fields */}
      {campaign.campaign_type === "shipping" ? (
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-300">
            제품 배송 주소 (상세주소 포함) <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={formData.shipping_address}
              onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })}
              placeholder="서울특별시 강남구 테헤란로 123 401호"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
            />
            <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              희망 방문 일시 <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={formData.visit_schedule}
                onChange={(e) => setFormData({ ...formData, visit_schedule: e.target.value })}
                placeholder="2026-09-05 오후 3시"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
              />
              <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              방문 동반 인원 (본인 포함) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={10}
              required
              value={formData.visit_party_size}
              onChange={(e) => setFormData({ ...formData, visit_party_size: Number(e.target.value) })}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* Custom Questions */}
      {customQuestions.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <h2 className="text-sm font-bold text-slate-200">추가 질문</h2>
          {customQuestions.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                {q.label} {q.required && <span className="text-red-400">*</span>}
              </label>
              <input
                type="text"
                required={q.required}
                value={customAnswers[q.id] || ""}
                onChange={(e) => setCustomAnswers({ ...customAnswers, [q.id]: e.target.value })}
                placeholder="답변을 입력하세요"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
      )}

      {/* Agreements */}
      <div className="pt-4 border-t border-slate-800 space-y-3">
        <label className="flex items-start gap-3 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            required
            checked={formData.privacy_agreed}
            onChange={(e) => setFormData({ ...formData, privacy_agreed: e.target.checked })}
            className="mt-0.5 accent-blue-600"
          />
          <span>
            [필수] 개인정보 수집 및 이용 동의 (체험단 선정 및 제품 배송/방문 안내 목적)
          </span>
        </label>

        <label className="flex items-start gap-3 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            required
            checked={formData.secondary_use_agreed}
            onChange={(e) => setFormData({ ...formData, secondary_use_agreed: e.target.checked })}
            className="mt-0.5 accent-blue-600"
          />
          <span>
            [필수] 제작된 콘텐츠의 브랜드 마케팅 2차 활용 동의
          </span>
        </label>
      </div>

      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/25 transition disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>접수 중...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>지원서 제출하기</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}