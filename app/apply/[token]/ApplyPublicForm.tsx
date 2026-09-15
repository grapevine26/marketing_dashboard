"use client";

import { useState } from "react";
import { PublicCampaign, CustomFormQuestion } from "@/lib/db/types";
import { submitApplicantAction } from "./actions";
import { Send, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";

const inputCls =
  "w-full px-3.5 py-3 sm:py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500";

/**
 * 방문 인원수를 서버(`lib/db/applicants.ts` 의 createApplicant)와 같은 기준으로 맞춘다.
 * 서버 기준: 값이 없으면 1명으로 보고, 있으면 `nonNegativeInt` 를 거쳐 1~20 으로 자른다.
 *
 * 화면에만 `min=1` 을 걸어 두면 0 이나 빈 값일 때 브라우저가 제출을 멈추는데,
 * 기본 말풍선은 금방 사라지고 사유도 페이지 안에 남지 않아 "눌러도 아무 반응이 없다"로 보인다.
 * 서버는 0 도 빈 값도 받아 주므로 막지 말고, 서버가 저장할 값으로 고쳐서 보여준다.
 * 화면에 보이는 숫자와 실제로 저장되는 숫자를 같게 만드는 것이 목적이다.
 */
function normalizeVisitPartySize(raw: string): number | null {
  const t = raw.trim();
  // 빈 값은 null 로 보낸다. 서버가 `?? 1` 로 1명 처리한다.
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  // 서버가 정수만 받으므로(소수·음수는 ValidationError) 여기서 먼저 정수로 만들고 1~20 으로 자른다.
  return Math.min(Math.max(Math.floor(n), 1), 20);
}

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
    // 입력 중인 값을 그대로 담아야 칸을 비울 수 있다. 숫자로 담으면 지우는 순간
    // Number("") 가 0 이 되어 칸에 "0" 이 다시 채워지고, 사용자가 비울 방법이 없어진다.
    visit_party_size: "1",
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
      // 동의 체크는 폼 맨 아래에 있고 에러 배너는 위쪽이라, 배너만으로는 왜 안 되는지 모른다.
      // 이 화면은 로그인 없는 인플루언서가 쓰므로 "눌렀는데 아무 일도 없다" 가 특히 나쁘다.
      const msg = "개인정보 수집 및 이용에 동의해주세요.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setSubmitting(true);
    const res = await safeCall(submitApplicantAction({
      token,
      ...formData,
      follower_count: formData.follower_count ? Number(formData.follower_count) : null,
      category: formData.category || null,
      // 문자열로 들고 있던 인원수를 서버 기준(빈 값=1명, 1~20 정수)으로 바꿔 보낸다.
      visit_party_size: normalizeVisitPartySize(formData.visit_party_size),
      honeypot,
      allow_duplicate: allowDuplicate,
    }));
    setSubmitting(false);
    if (!res.ok) {
      if (res.error.startsWith("DUPLICATE_SNS:")) {
        setDuplicateWarning("이미 동일한 SNS 링크로 접수된 지원서가 있습니다. 기존 접수 건 외에 추가로 접수하시겠습니까?");
        return;
      }
      setError(res.error);
      toast.error(res.error || "접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setDuplicateWarning(null);
    toast.success("지원서가 접수되었습니다.");
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl bg-surface border border-border text-center space-y-3 shadow-2xl font-sans">
        <div className="w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-base sm:text-lg font-bold text-text">지원이 성공적으로 완료되었습니다!</h2>
        <p className="text-xs text-text-sub leading-relaxed">
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
          <label className="flex items-center gap-2 text-xs text-text-2 cursor-pointer">
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
    <form onSubmit={handleSubmit} className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl bg-surface border border-border space-y-4 sm:space-y-5 shadow-2xl font-sans">
      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}

      <div className="space-y-1">
        <label className="text-xs font-semibold text-text-2">성함 / 활동명 *</label>
        <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="홍길동" className={inputCls} />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-text-2">활동 SNS 계정 URL *</label>
        <input type="url" required value={formData.sns_link} onChange={(e) => setFormData({ ...formData, sns_link: e.target.value })} placeholder="https://instagram.com/your_id" className={inputCls} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-2">팔로워 / 구독자 수 (선택)</label>
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
          <label className="text-xs font-semibold text-text-2">주요 활동 분야 (선택)</label>
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
          <label className="text-xs font-semibold text-text-2">연락처 *</label>
          <input type="tel" required value={formData.contact} onChange={(e) => setFormData({ ...formData, contact: e.target.value })} placeholder="010-1234-5678" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-2">국적 *</label>
          <input type="text" required value={formData.nationality} onChange={(e) => setFormData({ ...formData, nationality: e.target.value })} className={inputCls} />
        </div>
      </div>

      {isShipping ? (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-2">배송지 주소 (상세주소 포함) *</label>
          <input type="text" required value={formData.shipping_address} onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })} placeholder="서울특별시 강남구 테헤란로 123 401호" className={inputCls} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-2">방문 희망 일정 *</label>
            <input type="text" required value={formData.visit_schedule} onChange={(e) => setFormData({ ...formData, visit_schedule: e.target.value })} placeholder="예: 9월 10일 오후 3시" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-2">방문 인원수</label>
            {/*
              min/max 를 걸지 않는다. 걸어 두면 0 이나 21 을 넣었을 때 브라우저가 제출을 막는데,
              그 사유가 화면에 남지 않아 인플루언서 입장에서는 버튼이 죽은 것처럼 보인다.
              대신 칸에서 포커스가 빠질 때 서버가 저장할 값(1~20)으로 바꿔 눈으로 확인시킨다.
            */}
            <input
              type="number"
              inputMode="numeric"
              step={1}
              placeholder="1"
              value={formData.visit_party_size}
              onChange={(e) => setFormData({ ...formData, visit_party_size: e.target.value })}
              onBlur={() =>
                setFormData((prev) => {
                  const n = normalizeVisitPartySize(prev.visit_party_size);
                  return { ...prev, visit_party_size: n === null ? "" : String(n) };
                })
              }
              className={inputCls}
            />
            <p className="text-[11px] text-text-sub leading-snug">비워두면 1명으로 접수되며, 최대 20명까지 입력할 수 있습니다.</p>
          </div>
        </div>
      )}

      {customQuestions.length > 0 && (
        <div className="pt-2 border-t border-border space-y-3">
          {customQuestions.map((q) => (
            <div key={q.id} className="space-y-1">
              <label className="text-xs font-semibold text-text-2">
                {q.label} {q.required && <span className="text-blue-400">*</span>}
              </label>
              {renderCustom(q)}
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-border space-y-3 text-xs text-text-sub">
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
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-warn-soft space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-warn">중복 지원 확인 안내</p>
              <p className="text-text-2 leading-relaxed">{duplicateWarning}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(undefined, true)}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition active:scale-95 text-center disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              {/* 아래 제출 버튼과 같은 방식. 이 화면은 외부인(인플루언서)이 쓰고 제출이 느릴 수 있어
                  표시가 없으면 멈춘 줄 알고 다시 누른다. */}
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>기존 내역 유지하고 계속 제출하기</span>
            </button>
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              className="px-3.5 py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs transition text-center"
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
