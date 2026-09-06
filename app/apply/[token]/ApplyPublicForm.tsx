"use client";

import { useState } from "react";
import { PublicCampaign, CustomFormQuestion } from "@/lib/db/types";
import { submitApplicantAction } from "./actions";
import { Send, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

const inputCls =
  "w-full px-3.5 py-3 sm:py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500";

export default function ApplyPublicForm({
  token,
  campaign,
  customQuestions,
}: {
  token: string;
  campaign: PublicCampaign;
  customQuestions: CustomFormQuestion[];
}) {
  const isShipping = campaign.campaign_type === "shipping";

  const [formData, setFormData] = useState({
    name: "",
    sns_link: "",
    nationality: "대한민국",
    contact: "",
    follower_count: "",
    category: "",
    shipping_address: "",
    visit_schedule: "",
    visit_party_size: 1,
    custom_answers: {} as Record<string, string | number | boolean>,
    privacy_agreed: false,
    secondary_use_agreed: false,
  });

  const [honeypot, setHoneypot] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setCustom = (id: string, value: string | number | boolean) =>
    setFormData((prev) => ({ ...prev, custom_answers: { ...prev.custom_answers, [id]: value } }));

  const handleSubmit = async (e?: React.FormEvent, allowDuplicate = false) => {
    if (e) e.preventDefault();
    setError(null);
    if (!allowDuplicate) setDuplicateWarning(null);
    if (!formData.privacy_agreed) {
      setError("개인정보 수집 및 이용에 동의해주세요.");
      return;
    }

    setSubmitting(true);
    const res = await submitApplicantAction({
      token,
      ...formData,
      follower_count: formData.follower_count ? Number(formData.follower_count) : null,
      category: formData.category || null,
      honeypot,
      allow_duplicate: allowDuplicate,
    });
    setSubmitting(false);
    if (!res.ok) {
      if (res.error.startsWith("DUPLICATE_SNS:")) {
        setDuplicateWarning("이미 동일한 SNS 링크로 접수된 지원서가 있습니다. 기존 접수 건 외에 추가로 접수하시겠습니까?");
        return;
      }
      setError(res.error);
      return;
    }
    setDuplicateWarning(null);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="p-6 sm:p-8 rounded-3xl bg-[#131418] border border-[#22242A] text-center space-y-3 shadow-2xl font-sans">
        <div className="w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-base sm:text-lg font-bold text-zinc-100">지원이 성공적으로 완료되었습니다!</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          선정되신 분들께는 기재해주신 연락처로 개별 안내 메시지를 발송해 드립니다.
        </p>
      </div>
    );
  }

  const renderCustom = (q: CustomFormQuestion) => {
    const value = formData.custom_answers[q.id];
    switch (q.type) {
      case "number":
        return (
          <input
            type="number"
            required={q.required}
            value={value === undefined ? "" : String(value)}
            onChange={(e) => setCustom(q.id, e.target.value)}
            className={inputCls}
          />
        );
      case "select":
        return (
          <select
            required={q.required}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => setCustom(q.id, e.target.value)}
            className={inputCls}
          >
            <option value="">선택해주세요</option>
            {(q.options || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case "checkbox":
        return (
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              required={q.required}
              checked={value === true}
              onChange={(e) => setCustom(q.id, e.target.checked)}
              className="accent-blue-600 w-4 h-4 rounded"
            />
            <span>예, 해당합니다 / 동의합니다</span>
          </label>
        );
      default:
        return (
          <input
            type="text"
            required={q.required}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => setCustom(q.id, e.target.value)}
            className={inputCls}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 sm:p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 sm:space-y-5 shadow-2xl font-sans">
      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">성함 / 활동명 *</label>
        <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="홍길동" className={inputCls} />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">활동 SNS 계정 URL *</label>
        <input type="url" required value={formData.sns_link} onChange={(e) => setFormData({ ...formData, sns_link: e.target.value })} placeholder="https://instagram.com/your_id" className={inputCls} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">팔로워 / 구독자 수 (선택)</label>
          <input
            type="number"
            min="0"
            value={formData.follower_count}
            onChange={(e) => setFormData({ ...formData, follower_count: e.target.value })}
            placeholder="예: 15000"
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">주요 활동 분야 (선택)</label>
          <input
            type="text"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            placeholder="예: 뷰티, 패션, 라이프, 푸드"
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">연락처 *</label>
          <input type="tel" required value={formData.contact} onChange={(e) => setFormData({ ...formData, contact: e.target.value })} placeholder="010-1234-5678" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">국적 *</label>
          <input type="text" required value={formData.nationality} onChange={(e) => setFormData({ ...formData, nationality: e.target.value })} className={inputCls} />
        </div>
      </div>

      {isShipping ? (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300">배송지 주소 (상세주소 포함) *</label>
          <input type="text" required value={formData.shipping_address} onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })} placeholder="서울특별시 강남구 테헤란로 123 401호" className={inputCls} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">방문 희망 일정 *</label>
            <input type="text" required value={formData.visit_schedule} onChange={(e) => setFormData({ ...formData, visit_schedule: e.target.value })} placeholder="예: 9월 10일 오후 3시" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">방문 인원수</label>
            <input type="number" min={1} max={20} value={formData.visit_party_size} onChange={(e) => setFormData({ ...formData, visit_party_size: Number(e.target.value) })} className={inputCls} />
          </div>
        </div>
      )}

      {customQuestions.length > 0 && (
        <div className="pt-2 border-t border-[#22242A] space-y-3">
          {customQuestions.map((q) => (
            <div key={q.id} className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">
                {q.label} {q.required && <span className="text-blue-400">*</span>}
              </label>
              {renderCustom(q)}
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-[#22242A] space-y-3 text-xs text-zinc-400">
        <label className="flex items-start gap-2.5 cursor-pointer py-1">
          <input type="checkbox" required checked={formData.privacy_agreed} onChange={(e) => setFormData({ ...formData, privacy_agreed: e.target.checked })} className="accent-blue-600 w-4 h-4 mt-0.5 rounded" />
          <span className="leading-snug">(필수) 개인정보 수집 및 리워드 배송/일정 안내를 위한 이용에 동의합니다.</span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer py-1">
          <input type="checkbox" checked={formData.secondary_use_agreed} onChange={(e) => setFormData({ ...formData, secondary_use_agreed: e.target.checked })} className="accent-blue-600 w-4 h-4 mt-0.5 rounded" />
          <span className="leading-snug">(선택) 제작된 콘텐츠의 브랜드 2차 마케팅 활용에 동의합니다.</span>
        </label>
      </div>

      {/* 허니팟 숨김 필드 (봇 스팸 방어) */}
      <div style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
        <label htmlFor="agency_hp_website">웹사이트 (비워두세요)</label>
        <input
          id="agency_hp_website"
          type="text"
          name="agency_hp_website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {/* 중복 SNS 경고 및 계속 제출 UI */}
      {duplicateWarning && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-300">중복 지원 확인 안내</p>
              <p className="text-zinc-300 leading-relaxed">{duplicateWarning}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(undefined, true)}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition active:scale-95 text-center"
            >
              기존 내역 유지하고 계속 제출하기
            </button>
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              className="px-3.5 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-300 text-xs transition text-center"
            >
              SNS 링크 수정하기
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3.5 sm:py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/25 transition disabled:opacity-50 inline-flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        <span>인플루언서 지원서 제출하기</span>
      </button>
    </form>
  );
}
