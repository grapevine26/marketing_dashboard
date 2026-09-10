import { describe, it, expect, beforeEach } from "vitest";
import {
  createCampaign,
  createApplicant,
  getCampaignByToken,
  getApplicantsByCampaignId,
  createSnsAccount,
  getSnsAccountByToken,
  regenerateCampaignToken,
  regenerateSnsToken,
  getAuditLogs,
} from "@/lib/db";
import { checkRateLimit, resetRateLimitStore, getRateLimitUsed, rollbackRateLimit } from "@/lib/security/rateLimit";
import { submitApplicantAction } from "@/app/apply/[token]/actions";
import { submitPublicPreSurveyAction, getPublicAiAssistAction } from "@/app/pre-survey/[token]/actions";
import { submitSnsIntakeAction, assistSnsIntakeAction } from "@/app/sns-intake/actions";
import * as snsAssistModule from "@/lib/ai/snsIntakeAssist";
import * as preAssistModule from "@/lib/ai/preSurveyAssist";
import { vi } from "vitest";

describe("1-2 & 1-3 Security: Rate Limiting, Honeypot Spam Defense, and Token Reissuance", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  describe("Rate Limiting (lib/security/rateLimit.ts)", () => {
    it("allows requests up to maxRequests and blocks subsequent requests", () => {
      const key = "test:ip:1";
      for (let i = 0; i < 5; i++) {
        const res = checkRateLimit(key, 5, 60000);
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(4 - i);
      }

      // 6th request should be blocked
      const blocked = checkRateLimit(key, 5, 60000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);

      // Reset works
      resetRateLimitStore();
      const afterReset = checkRateLimit(key, 5, 60000);
      expect(afterReset.allowed).toBe(true);
      expect(afterReset.remaining).toBe(4);
    });

    it("getRateLimitUsed는 요청을 소비하지 않고 현재 사용 횟수만 반환한다", () => {
      const key = "test:query:1";
      expect(getRateLimitUsed(key)).toBe(0);

      checkRateLimit(key, 3, 60000);
      expect(getRateLimitUsed(key)).toBe(1);

      checkRateLimit(key, 3, 60000);
      expect(getRateLimitUsed(key)).toBe(2);

      // getRateLimitUsed 호출 후에도 여전히 2회
      expect(getRateLimitUsed(key)).toBe(2);
    });

    it("rollbackRateLimit는 직전 요청 1회를 롤백한다", () => {
      const key = "test:rollback:1";
      checkRateLimit(key, 3, 60000);
      checkRateLimit(key, 3, 60000);
      expect(getRateLimitUsed(key)).toBe(2);

      rollbackRateLimit(key);
      expect(getRateLimitUsed(key)).toBe(1);
    });
  });

  describe("AI 추천 악용 방지 (질문당 최대 3회 제한)", () => {
    it("SNS 사전설문 AI 추천은 질문당 3회까지 허용되고 4회째에 차단된다", async () => {
      const acc = await createSnsAccount({
        company_name: "AI테스트브랜드",
        platform: "instagram",
        handle: "ai_test_kr",
        starts_on: null,
        ends_on: null,
      });

      // assistSnsIntake를 spy하여 성공 응답 반환 모킹
      vi.spyOn(snsAssistModule, "assistSnsIntake").mockResolvedValue({
        suggestions: ["키워드1", "키워드2"],
        recommendedDraft: "테스트 추천 초안",
        fallback: false,
      });

      const qId = "sq1";

      // 1~3회차 성공
      for (let i = 1; i <= 3; i++) {
        const res = await assistSnsIntakeAction({
          token: acc.intake_token,
          questionId: qId,
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.data.remainingAttempts).toBe(3 - i);
        }
      }

      // 4회차 시도 시 차단
      const blocked = await assistSnsIntakeAction({
        token: acc.intake_token,
        questionId: qId,
      });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) {
        expect(blocked.error).toContain("질문당 최대 3회");
      }
    });

    it("체험단 사전조사 AI 추천도 질문당 3회 제한이 적용된다", async () => {
      const camp = await createCampaign({
        name: "AI체험단캠페인",
        company_name: "테스트컴퍼니",
        campaign_type: "shipping",
      });

      vi.spyOn(preAssistModule, "assistPreSurvey").mockResolvedValue({
        suggestions: ["포인트1"],
        recommendedDraft: "체험단 추천 답변",
        fallback: false,
      });

      const qId = "q1";

      // 1~3회 성공
      for (let i = 1; i <= 3; i++) {
        const res = await getPublicAiAssistAction({
          token: camp.pre_survey_token,
          questionId: qId,
        });
        expect(res.ok).toBe(true);
      }

      // 4회차 차단
      const blocked = await getPublicAiAssistAction({
        token: camp.pre_survey_token,
        questionId: qId,
      });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) {
        expect(blocked.error).toContain("질문당 최대 3회");
      }
    });

    it("AI 호출 실패(폴백) 시 횟수가 차감되지 않고 롤백된다", async () => {
      const acc = await createSnsAccount({
        company_name: "롤백테스트브랜드",
        platform: "instagram",
        handle: "rollback_test",
        starts_on: null,
        ends_on: null,
      });

      // fallback: true 모킹
      vi.spyOn(snsAssistModule, "assistSnsIntake").mockResolvedValue({
        suggestions: [],
        recommendedDraft: "",
        fallback: true,
      });

      const qId = "sq1";
      const res = await assistSnsIntakeAction({
        token: acc.intake_token,
        questionId: qId,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.fallback).toBe(true);
      }

      // 실패했으므로 카운트가 0이어야 함
      expect(getRateLimitUsed(`ai_assist:sns:${acc.intake_token}:${qId}`)).toBe(0);
    });
  });

  describe("Honeypot Spam Defense (Public Actions)", () => {
    it("silently drops spam submission when honeypot is filled in submitApplicantAction", async () => {
      const camp = await createCampaign({
        name: "스팸테스트캠페인",
        company_name: "글로벌브랜드",
        campaign_type: "shipping",
      });

      const initialApps = await getApplicantsByCampaignId(camp.id);
      expect(initialApps.length).toBe(0);

      // Submit with honeypot filled
      const res = await submitApplicantAction({
        token: camp.apply_form_token,
        name: "스팸봇",
        sns_link: "https://instagram.com/spam_bot",
        nationality: "대한민국",
        contact: "010-0000-0000",
        shipping_address: "서울시 강남구",
        custom_answers: {},
        privacy_agreed: true,
        secondary_use_agreed: false,
        honeypot: "http://spam-link.com", // filled by bot!
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.id).toBe("spam_filtered");

      // Verify DB was NOT modified
      const afterApps = await getApplicantsByCampaignId(camp.id);
      expect(afterApps.length).toBe(0);
    });

    it("silently drops spam submission when honeypot is filled in submitPublicPreSurveyAction", async () => {
      const camp = await createCampaign({
        name: "사전조사스팸캠페인",
        company_name: "글로벌브랜드",
        campaign_type: "shipping",
      });

      const res = await submitPublicPreSurveyAction({
        token: camp.pre_survey_token,
        answers: { q1: "스팸내용" },
        usedAiAssist: false,
        honeypot: "bot_filled_value",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.submitted_at).toBeDefined();
    });

    it("silently drops spam submission when honeypot is filled in submitSnsIntakeAction", async () => {
      const acc = await createSnsAccount({
        company_name: "스팸테스트브랜드",
        platform: "instagram",
        handle: "spam_brand",
        starts_on: null,
        ends_on: null,
      });

      const res = await submitSnsIntakeAction({
        token: acc.intake_token,
        answers: { brand_intro: "스팸광고" },
        honeypot: "bot_input",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.submitted_at).toBeDefined();
    });
  });

  describe("Duplicate SNS Link Check in Applicant Submission", () => {
    it("warns on duplicate SNS link unless allow_duplicate is explicitly true", async () => {
      const camp = await createCampaign({
        name: "중복SNS캠페인",
        company_name: "글로벌에이전시",
        campaign_type: "shipping",
      });

      // 1st applicant
      await createApplicant({
        campaign_id: camp.id,
        name: "김인플루언서",
        sns_link: "https://instagram.com/influencer_1",
        nationality: "대한민국",
        contact: "010-1234-5678",
        shipping_address: "서울시 강남구 테헤란로",
        privacy_agreed: true,
        secondary_use_agreed: false,
      });

      // 2nd applicant with same SNS link should throw DUPLICATE_SNS
      await expect(
        createApplicant({
          campaign_id: camp.id,
          name: "김인플루언서(재접수)",
          sns_link: "https://instagram.com/influencer_1/", // with trailing slash
          nationality: "대한민국",
          contact: "010-1234-5678",
          shipping_address: "서울시 강남구 테헤란로",
          privacy_agreed: true,
          secondary_use_agreed: false,
        })
      ).rejects.toThrow(/DUPLICATE_SNS/);

      // 3rd submission with allow_duplicate=true should succeed
      const duplicateAllowed = await createApplicant({
        campaign_id: camp.id,
        name: "김인플루언서(수정제출)",
        sns_link: "https://instagram.com/influencer_1",
        nationality: "대한민국",
        contact: "010-1234-5678",
        shipping_address: "서울시 강남구 테헤란로 202호",
        privacy_agreed: true,
        secondary_use_agreed: false,
        allow_duplicate: true,
      });

      expect(duplicateAllowed.id).toBeDefined();
      const allApps = await getApplicantsByCampaignId(camp.id);
      expect(allApps.length).toBe(2);
    });
  });

  describe("Token Reissuance & Revocation (1-3)", () => {
    it("regenerates campaign apply_form_token and invalidates the previous token immediately", async () => {
      const camp = await createCampaign({
        name: "토큰재발급캠페인",
        company_name: "글로벌에이전시",
        campaign_type: "shipping",
      });

      const oldToken = camp.apply_form_token;
      expect(await getCampaignByToken("apply_form", oldToken)).not.toBeNull();

      // Regenerate token
      const updated = await regenerateCampaignToken(camp.id, "apply_form");
      const newToken = updated.apply_form_token;

      expect(newToken).not.toBe(oldToken);
      expect(newToken).toMatch(/^apply_/);

      // Old token lookup must return null (immediate 404 in UI)
      const lookupOld = await getCampaignByToken("apply_form", oldToken);
      expect(lookupOld).toBeNull();

      // New token lookup must return the campaign
      const lookupNew = await getCampaignByToken("apply_form", newToken);
      expect(lookupNew).not.toBeNull();
      expect(lookupNew?.id).toBe(camp.id);

      // Verify audit log
      const logs = await getAuditLogs({ campaign_id: camp.id });
      const regenLog = logs.find((l) => l.action === "token_regenerated");
      expect(regenLog).toBeDefined();
      expect(regenLog?.summary).toContain("외부 공유 링크 토큰이 재발급되었습니다");
    });

    it("regenerates SNS account approval_token and invalidates previous token", async () => {
      const acc = await createSnsAccount({
        company_name: "글로벌SNS계정",
        platform: "instagram",
        handle: "global_brand_official",
        starts_on: null,
        ends_on: null,
      });

      const oldApprovalToken = acc.approval_token;
      expect(await getSnsAccountByToken("approval", oldApprovalToken)).not.toBeNull();

      // Regenerate approval token
      const updated = await regenerateSnsToken(acc.id, "approval");
      const newApprovalToken = updated.approval_token;

      expect(newApprovalToken).not.toBe(oldApprovalToken);
      expect(newApprovalToken).toMatch(/^sns_appr_/);

      // Old approval token must be invalid
      expect(await getSnsAccountByToken("approval", oldApprovalToken)).toBeNull();

      // New approval token must resolve
      const lookupNew = await getSnsAccountByToken("approval", newApprovalToken);
      expect(lookupNew).not.toBeNull();
      expect(lookupNew?.id).toBe(acc.id);

      // Verify audit log
      const logs = await getAuditLogs({ limit: 10 });
      const regenLog = logs.find((l) => l.action === "token_regenerated" && l.account_id === acc.id);
      expect(regenLog).toBeDefined();
      expect(regenLog?.summary).toContain("시안 승인");
    });
  });
});
