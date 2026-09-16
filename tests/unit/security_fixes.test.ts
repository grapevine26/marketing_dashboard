import { describe, it, expect, vi } from "vitest";

// 서버 액션은 저장 뒤 화면 캐시를 비우는데, 그건 요청 안에서만 되는 일이라 테스트에서는 터진다.
// 우리가 확인하려는 것은 캐시가 아니라 "끝난 캠페인이면 막히는가" 이므로 이 부분만 비워 둔다.
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
import { validateWebhookUrl, isDiscordWebhook, sendWebhookNotification } from "@/lib/notifications/webhook";
import { matchesMediaSignature, createCampaign, updateCampaignWebhookUrl, ValidationError } from "@/lib/db";
import { hasTestDb } from "./test-db";
import {
  toPublicCampaign,
  sanitizeApplicantForCompany,
  sanitizeSeedingForCompany,
  Campaign,
  Applicant,
  SeedingRecord,
  CustomFormQuestion,
} from "@/lib/db/types";

describe("웹훅 URL 검증 (SSRF 방지)", () => {
  it("허용 호스트의 https 만 통과한다", () => {
    expect(validateWebhookUrl("https://hooks.slack.com/services/T1/B1/xxx").ok).toBe(true);
    expect(validateWebhookUrl("https://discord.com/api/webhooks/123/abc").ok).toBe(true);
    expect(validateWebhookUrl("http://hooks.slack.com/services/T1/B1/xxx").ok).toBe(false);
    expect(validateWebhookUrl("https://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(validateWebhookUrl("https://example.com/hook").ok).toBe(false);
    expect(validateWebhookUrl("not a url").ok).toBe(false);
    expect(validateWebhookUrl("https://discord.com/other").ok).toBe(false);
  });

  it("Discord 웹훅을 구분한다", () => {
    expect(isDiscordWebhook("https://discord.com/api/webhooks/1/a")).toBe(true);
    expect(isDiscordWebhook("https://hooks.slack.com/services/a")).toBe(false);
  });

  it("sendWebhookNotification 은 허용되지 않은 주소로 요청을 보내지 않는다", async () => {
    const r = await sendWebhookNotification("https://internal.corp/hook", { event: "test.ping", title: "t", message: "m" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("지원하지 않는");
  });

  it.skipIf(!hasTestDb)("DB 저장 시에도 같은 검증을 거친다", async () => {
    const camp = await createCampaign({ name: "wh", company_name: "b", campaign_type: "shipping" });
    await expect(updateCampaignWebhookUrl(camp.id, "http://localhost:3000/x")).rejects.toBeInstanceOf(ValidationError);
    const ok = await updateCampaignWebhookUrl(camp.id, "https://hooks.slack.com/services/T/B/C");
    expect(ok?.webhook_url).toBe("https://hooks.slack.com/services/T/B/C");
  });
});

describe("공개 DTO", () => {
  it("PublicCampaign 에는 토큰·웹훅·템플릿이 없다", () => {
    const c = {
      id: "c", name: "n", company_name: "b", campaign_type: "shipping", status: "recruiting",
      pre_survey_token: "ps", apply_form_token: "ap", applicants_share_token: "as", seeding_sheet_share_token: "ss",
      webhook_url: "https://hooks.slack.com/services/SECRET", message_templates: { selected: "내부" }, created_at: "",
    } as Campaign;
    const pub = toPublicCampaign(c) as unknown as Record<string, unknown>;
    for (const k of ["webhook_url", "message_templates", "pre_survey_token", "apply_form_token", "applicants_share_token", "seeding_sheet_share_token"]) {
      expect(pub).not.toHaveProperty(k);
    }
  });

  it("sanitizeApplicantForCompany 는 연락처·주소·내부 메모를 비운다", () => {
    const a = { id: "a", campaign_id: "c", name: "n", sns_link: "https://x", nationality: "KR", contact: "010", shipping_address: "addr", agency_memo: "비밀", follower_count: 100, privacy_agreed: true, secondary_use_agreed: false, status: "applied", status_changed_by: "agency", applied_at: "" } as Applicant;
    const s = sanitizeApplicantForCompany(a);
    expect(s.contact).toBe("");
    expect(s.shipping_address).toBeUndefined();
    expect(s.agency_memo).toBeUndefined();
    expect(s.follower_count).toBe(100);
  });
});

describe("미디어 시그니처", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  it("실제 내용과 MIME 이 맞아야 한다", () => {
    expect(matchesMediaSignature(png, "image/png")).toBe(true);
    expect(matchesMediaSignature(png, "image/jpeg")).toBe(false);
    expect(matchesMediaSignature(Buffer.from("MZ not an image at all"), "image/png")).toBe(false);
    expect(matchesMediaSignature(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]), "image/jpeg")).toBe(true);
    expect(matchesMediaSignature(Buffer.concat([Buffer.from("\0\0\0\x18ftypmp42", "latin1"), Buffer.alloc(16)]), "video/mp4")).toBe(true);
  });
});

describe("광고주 공유 관리시트에서 지우는 값", () => {
  /** 관리시트 한 줄의 시딩 기록. 배송지와 방문 일정은 지원자 쪽과 **별도로** 여기에도 있다. */
  const record: SeedingRecord = {
    id: "s1",
    campaign_id: "c1",
    applicant_id: "a1",
    progress_stage: "선정완료",
    upload_deadline: "2026-10-01",
    upload_link: "https://example.com/post",
    views: 1234,
    engagement: 56,
    notes: "택배 분실 이력 있음. 재발송 필요",
    shipping_address: "서울시 강남구 테헤란로 1길 2, 301호",
    visit_scheduled_at: "2026-10-05T10:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-02T00:00:00.000Z",
  };

  it("배송지·방문 일정·내부 비고를 비운다", () => {
    const clean = sanitizeSeedingForCompany(record);
    expect(clean.shipping_address).toBeUndefined();
    expect(clean.visit_scheduled_at).toBeUndefined();
    expect(clean.notes).toBeNull();

    // 직렬화했을 때 어디에도 원문이 남지 않아야 한다.
    // 화면에 안 그려도 서버가 내려보내면 페이지 안에 값이 실린다.
    const serialized = JSON.stringify(clean);
    expect(serialized).not.toContain("테헤란로");
    expect(serialized).not.toContain("택배 분실");
    expect(serialized).not.toContain("2026-10-05");
  });

  it("광고주가 봐야 하는 값은 그대로 둔다", () => {
    const clean = sanitizeSeedingForCompany(record);
    expect(clean.progress_stage).toBe("선정완료");
    expect(clean.upload_deadline).toBe("2026-10-01");
    expect(clean.upload_link).toBe("https://example.com/post");
    expect(clean.views).toBe(1234);
    expect(clean.engagement).toBe(56);
  });

  it("지원자와 시딩 기록 둘 다 씻어야 주소가 사라진다", () => {
    // 한쪽만 씻으면 다른 쪽에 그대로 남는다. 실제로 그 상태로 배포돼 있었다.
    const applicant = {
      id: "a1",
      campaign_id: "c1",
      name: "홍길동",
      contact: "010-1234-5678",
      sns_link: "https://instagram.com/x",
      status: "selected",
      applied_at: "2026-09-01T00:00:00.000Z",
      shipping_address: "서울시 강남구 테헤란로 1길 2, 301호",
    } as unknown as Applicant;

    const onlyApplicant = JSON.stringify({ applicant: sanitizeApplicantForCompany(applicant), seeding: record });
    expect(onlyApplicant).toContain("테헤란로");

    const both = JSON.stringify({
      applicant: sanitizeApplicantForCompany(applicant),
      seeding: sanitizeSeedingForCompany(record),
    });
    expect(both).not.toContain("테헤란로");
    expect(both).not.toContain("010-1234-5678");
  });
});

describe.skipIf(!hasTestDb)("끝난 캠페인·계약의 공개 링크", () => {
  it("캠페인을 종료하면 공유 링크로 더 이상 고칠 수 없다", async () => {
    const { createCampaign, updateCampaign } = await import("@/lib/db/campaigns");
    const { submitApplicantAction } = await import("@/app/apply/[token]/actions");

    const campaign = await createCampaign({
      name: "종료 확인용",
      company_name: "브랜드",
      campaign_type: "shipping",
    });

    const apply = {
      token: campaign.apply_form_token,
      name: "홍길동",
      nationality: "대한민국",
      contact: "010-1111-2222",
      sns_link: "https://instagram.com/probe",
      shipping_address: "서울시 1",
      privacy_agreed: true,
      secondary_use_agreed: false,
      custom_answers: {},
    };

    // 진행 중에는 지원이 된다.
    const before = await submitApplicantAction(apply);
    expect(before.ok).toBe(true);

    await updateCampaign(campaign.id, { status: "completed" });

    // 끝나면 같은 링크로 더 이상 받지 않는다. 링크는 살아 있지만 대상이 닫혔다.
    const after = await submitApplicantAction({ ...apply, sns_link: "https://instagram.com/probe2" });
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.error).toMatch(/종료된 캠페인/);
  }, 30_000);

  it("계약이 끝난 SNS 계정은 광고주가 시안을 승인할 수 없다", async () => {
    const { createSnsAccount, updateSnsAccount, createSnsContent } = await import("@/lib/db/sns");
    const { reviewSnsContentByTokenAction } = await import("@/app/sns-approval/[token]/actions");

    const account = await createSnsAccount({
      company_name: "브랜드",
      platform: "instagram",
      handle: "brand",
      starts_on: null,
      ends_on: null,
    });
    const content = await createSnsContent({
      account_id: account.id,
      title: "9월 1주차",
      scheduled_on: null,
      assignee: null,
      caption: null,
      hashtags: null,
      media_note: null,
    });
    await updateSnsAccount(account.id, { status: "ended" });

    const res = await reviewSnsContentByTokenAction({
      token: account.approval_token,
      contentId: content.id,
      decision: "approve",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/종료된 계약/);
  }, 30_000);
});

describe("공개 경로 목록", () => {
  it("내보내기는 열려 있지만 토큰이 없으면 라우트가 막는다", async () => {
    const { readFileSync } = await import("node:fs");

    // 광고주가 공유 화면에서 누르는 버튼이라 프록시는 열어야 한다.
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).toContain('"/api/applicants/export"');
    expect(proxy).toContain('"/api/seeding-sheet/export"');

    // **정확히 일치(PUBLIC_PATHS)로 열어야 한다.** 접두사 목록에 두면 startsWith 라서
    // `/api/applicants/export-all` 같은 주소까지 미리 열어두는 셈이 된다. 지금은 그런
    // 라우트가 없지만, 언젠가 그 이름으로 만드는 사람이 프록시를 다시 볼 이유가 없다.
    const exactBlock = proxy.slice(proxy.indexOf("const PUBLIC_PATHS"), proxy.indexOf("const PUBLIC_PREFIXES"));
    expect(exactBlock).toContain('"/api/applicants/export"');
    expect(exactBlock).toContain('"/api/seeding-sheet/export"');

    // 접두사 목록의 모든 항목은 `/` 로 끝나야 한다. `/apply` 로 적으면 `/applicants-secret` 까지 열린다.
    const prefixBlock = proxy.slice(proxy.indexOf("const PUBLIC_PREFIXES"), proxy.indexOf("function isPublic"));
    for (const m of prefixBlock.matchAll(/"([^"]+)"/g)) {
      expect(m[1]!.endsWith("/")).toBe(true);
    }

    // 열어둔 대신 라우트가 직접 막아야 한다. 둘 중 하나만 있으면 구멍이 된다.
    for (const p of ["app/api/applicants/export/route.ts", "app/api/seeding-sheet/export/route.ts"]) {
      const src = readFileSync(p, "utf8");
      expect(src).toContain("if (!token)");
      expect(src).toContain("requireApiUser()");
      // 토큰 모드에서는 개인정보를 씻는다.
      expect(src).toContain("sanitizeApplicantForCompany");
    }

    // 관리시트는 시딩 기록도 씻어야 한다. 배송지가 양쪽에 있다.
    const seeding = readFileSync("app/api/seeding-sheet/export/route.ts", "utf8");
    expect(seeding).toContain("sanitizeSeedingForCompany");
  });
});

describe("CSP (lib/security/csp.ts)", () => {
  it("스크립트는 그 요청의 난수를 단 것만 실행된다", async () => {
    const { buildCsp, createNonce } = await import("@/lib/security/csp");
    const nonce = createNonce();
    const csp = buildCsp(nonce, false);
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "))!;

    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
    // 이 둘이 들어오는 순간 CSP 는 XSS 를 막지 못한다. 실수로 붙이는 걸 막는다.
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    // 난수는 요청마다 달라야 한다. 같으면 공격자가 앞선 응답에서 베껴 쓸 수 있다.
    expect(createNonce()).not.toBe(nonce);
  });

  it("개발에서만 eval 과 웹소켓을 연다", async () => {
    const { buildCsp } = await import("@/lib/security/csp");
    const dev = buildCsp("n", true);
    // React 가 서버 오류 스택을 되살리는 데 eval 을 쓰고, HMR 이 웹소켓으로 붙는다.
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws:");
  });

  it("브라우저가 Blob 저장소에 직접 올리는 길은 열어둔다", async () => {
    const { buildCsp } = await import("@/lib/security/csp");
    const connect = buildCsp("n", false).split("; ").find((d) => d.startsWith("connect-src "))!;
    // 여기를 닫으면 4.5MB 넘는 시안 업로드가 통째로 막힌다 (app/api/media/upload/route.ts).
    expect(connect).toContain("https://vercel.com");
    expect(connect).toContain("https://*.vercel-storage.com");
  });

  it("CSP 를 내보내는 곳은 proxy.ts 한 곳뿐이다", async () => {
    const { readFileSync } = await import("node:fs");
    // 두 곳에서 내보내면 브라우저가 두 정책을 모두 적용해 서로를 막는다.
    // 주석에서 언급하는 건 괜찮다. 헤더 항목으로 들어가 있으면 안 된다.
    expect(readFileSync("next.config.ts", "utf8")).not.toMatch(/key:\s*"Content-Security-Policy"/);
    expect(readFileSync("proxy.ts", "utf8")).toContain("Content-Security-Policy");
    // 난수는 요청 헤더로도 넘겨야 Next 가 자기 스크립트 태그에 같은 값을 붙인다.
    expect(readFileSync("proxy.ts", "utf8")).toContain("x-nonce");
    // 정적으로 미리 만든 HTML 에는 그 요청의 난수가 들어갈 수 없다.
    expect(readFileSync("app/layout.tsx", "utf8")).toContain('export const dynamic = "force-dynamic"');
  });
});

describe("검색엔진 색인 차단", () => {
  it("robots.txt 는 로그인 없이 읽히고, 사이트 전체를 막는다", async () => {
    const { readFileSync } = await import("node:fs");

    // 크롤러는 로그인을 하지 않는다. 공개가 아니면 로그인 화면으로 튕기고,
    // 크롤러는 그걸 "robots.txt 가 없다" 로 읽어 마음껏 긁는다. 없는 것보다 나쁘다.
    expect(readFileSync("proxy.ts", "utf8")).toContain('"/robots.txt"');

    const robots = readFileSync("app/robots.ts", "utf8");
    expect(robots).toContain('disallow: "/"');
    // 일부만 막으면 새 공개 경로가 생길 때마다 여기에 손으로 추가해야 한다. 전체를 막는다.
    // `\b` 로 단어 경계를 잡는다. toContain("allow:") 로 하면 disallow: 안에서도 걸린다.
    expect(robots).not.toMatch(/\ballow:/);
  });

  it("모든 페이지에 noindex 가 걸려 있다", async () => {
    const { readFileSync } = await import("node:fs");
    // robots.txt 로 막으면 크롤러가 페이지를 안 읽으므로 meta 도 못 본다.
    // 그래도 읽고 들어온 크롤러를 위해 루트 레이아웃에서 한 번 더 막는다.
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toMatch(/robots:\s*\{[^}]*index:\s*false/);
    expect(layout).toMatch(/robots:\s*\{[^}]*follow:\s*false/);
  });
});

/**
 * 광고주에게 나가는 필드를 **전수로** 못 박는다.
 *
 * 세 번의 유출은 전부 "지울 것만 적어 둔" 방어 때문이었다. 타입에 새 필드가 생기면
 * 아무도 손대지 않아도 그대로 나갔다. 이제 무해화 함수는 남길 것만 적는 골라 담기이고,
 * 이 테스트는 그 목록을 통째로 대조한다.
 *
 * 그래서 **새 필드를 추가하면 이 테스트가 깨지는 것이 정상이다.**
 * 깨졌을 때 할 일은 기대 목록에 이름을 밀어 넣는 것이 아니라,
 * "이 값을 광고주가 봐도 되는가" 를 사람이 판단하는 것이다.
 * 봐도 되면 무해화 함수와 이 목록에 같이 넣고, 아니면 함수는 그대로 두고 아무것도 안 한다.
 */
describe("광고주에게 나가는 필드 전수 대조", () => {
  /** 모든 필드를 채운 지원자. 빈 객체로 하면 통과해도 아무것도 증명하지 못한다. */
  const fullApplicant: Applicant = {
    id: "app_1",
    campaign_id: "camp_1",
    name: "김하늘",
    sns_link: "https://instagram.com/haneul",
    nationality: "대한민국",
    contact: "010-9876-5432",
    follower_count: 24500,
    category: "뷰티",
    agency_memo: "지난 캠페인 노쇼 이력. 이번엔 예비로만",
    shipping_address: "서울시 마포구 월드컵북로 396, 1802호",
    visit_schedule: "2026-10-12 14:00",
    visit_party_size: 2,
    custom_answers: { q_skin: "지성", q_age: 27, q_pet: true },
    privacy_agreed: true,
    secondary_use_agreed: false,
    status: "selected",
    status_changed_by: "agency",
    status_changed_at: "2026-09-10T02:00:00.000Z",
    applied_at: "2026-09-01T00:00:00.000Z",
  };

  /** 모든 필드를 채운 시딩 기록. */
  const fullSeeding: SeedingRecord = {
    id: "seed_1",
    campaign_id: "camp_1",
    applicant_id: "app_1",
    progress_stage: "발송완료",
    upload_deadline: "2026-10-20",
    upload_link: "https://instagram.com/p/abc123",
    views: 30210,
    engagement: 1420,
    notes: "주소 오기재로 재발송함. 수취인 전화 010-9876-5432",
    shipping_address: "서울시 마포구 월드컵북로 396, 1802호",
    visit_scheduled_at: "2026-10-12T05:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
    created_at: "2026-09-05T00:00:00.000Z",
  };

  it("sanitizeApplicantForCompany 가 내보내는 키는 이 목록과 정확히 같다", () => {
    const expected = [
      "applied_at",
      "campaign_id",
      "category",
      "contact",
      "custom_answers",
      "follower_count",
      "id",
      "name",
      "nationality",
      "privacy_agreed",
      "secondary_use_agreed",
      "sns_link",
      "status",
      "status_changed_at",
      "status_changed_by",
    ];
    expect(Object.keys(sanitizeApplicantForCompany(fullApplicant)).sort()).toEqual(expected);

    // 일부러 뺀 것들. 위 목록으로도 걸리지만, 무엇을 왜 뺐는지 남겨 둔다.
    const clean = sanitizeApplicantForCompany(fullApplicant) as unknown as Record<string, unknown>;
    for (const k of ["agency_memo", "shipping_address", "visit_schedule", "visit_party_size"]) {
      expect(clean).not.toHaveProperty(k);
    }
    expect(clean.contact).toBe("");

    // 직렬화했을 때 원문이 남지 않아야 한다. 화면에 안 그려도 페이지 소스에는 실린다.
    const serialized = JSON.stringify(clean);
    expect(serialized).not.toContain("월드컵북로");
    expect(serialized).not.toContain("010-9876-5432");
    expect(serialized).not.toContain("노쇼");
  });

  it("광고주가 봐야 하는 값은 그대로 나간다 (줄지 않았는지)", () => {
    const clean = sanitizeApplicantForCompany(fullApplicant);
    expect(clean.name).toBe("김하늘");
    expect(clean.sns_link).toBe("https://instagram.com/haneul");
    expect(clean.nationality).toBe("대한민국");
    expect(clean.follower_count).toBe(24500);
    expect(clean.category).toBe("뷰티");
    expect(clean.status).toBe("selected");
    expect(clean.status_changed_by).toBe("agency");
    expect(clean.status_changed_at).toBe("2026-09-10T02:00:00.000Z");
    expect(clean.applied_at).toBe("2026-09-01T00:00:00.000Z");
    expect(clean.secondary_use_agreed).toBe(false);
    // 질문 목록을 안 넘기면 예전처럼 답변이 전부 통과한다 (대행사 화면이 이 경로다).
    expect(clean.custom_answers).toEqual({ q_skin: "지성", q_age: 27, q_pet: true });
  });

  it("sanitizeSeedingForCompany 가 내보내는 키는 이 목록과 정확히 같다", () => {
    const expected = [
      "applicant_id",
      "campaign_id",
      "created_at",
      "engagement",
      "id",
      "notes",
      "progress_stage",
      "updated_at",
      "upload_deadline",
      "upload_link",
      "views",
    ];
    expect(Object.keys(sanitizeSeedingForCompany(fullSeeding)).sort()).toEqual(expected);

    const clean = sanitizeSeedingForCompany(fullSeeding) as unknown as Record<string, unknown>;
    for (const k of ["shipping_address", "visit_scheduled_at"]) {
      expect(clean).not.toHaveProperty(k);
    }
    expect(clean.notes).toBeNull();

    const serialized = JSON.stringify(clean);
    expect(serialized).not.toContain("월드컵북로");
    expect(serialized).not.toContain("010-9876-5432");
  });
});

/**
 * 지원폼에서 질문을 지워도 기존 지원자 행의 답변은 DB 에 남는다(정리하는 코드가 없다).
 * 광고주 화면은 현재 질문만 그리지만, 서버가 내려보내는 객체에 옛 답변이 실려 있으면
 * 페이지 소스만 열면 보인다. 지난 세 번의 사고와 정확히 같은 모양이다.
 */
describe("지워진 커스텀 질문의 옛 답변", () => {
  const applicant: Applicant = {
    id: "app_2",
    campaign_id: "camp_1",
    name: "박도윤",
    sns_link: "https://instagram.com/doyun",
    nationality: "대한민국",
    contact: "010-1111-2222",
    follower_count: 8100,
    category: "푸드",
    agency_memo: "메모",
    shipping_address: "부산시 해운대구 1",
    visit_schedule: "2026-10-01 11:00",
    visit_party_size: 1,
    custom_answers: {
      q_current: "현재도 묻는 질문의 답",
      // 대행사가 지원폼에서 지운 질문들. 값은 DB 에 그대로 남아 있다.
      q_deleted_income: "월 소득 300만원대",
      q_deleted_addr: "부산시 해운대구 우동 123-4",
    },
    privacy_agreed: true,
    secondary_use_agreed: true,
    status: "applied",
    status_changed_by: "agency",
    status_changed_at: undefined,
    applied_at: "2026-09-02T00:00:00.000Z",
  };

  it("현재 질문 목록에 없는 키는 광고주용 결과에서 사라진다", () => {
    const clean = sanitizeApplicantForCompany(applicant, ["q_current"]);

    expect(clean.custom_answers).toEqual({ q_current: "현재도 묻는 질문의 답" });
    expect(clean.custom_answers).not.toHaveProperty("q_deleted_income");
    expect(clean.custom_answers).not.toHaveProperty("q_deleted_addr");

    // 키만 사라지는 게 아니라 값도 어디에도 남지 않아야 한다.
    const serialized = JSON.stringify(clean);
    expect(serialized).not.toContain("월 소득");
    expect(serialized).not.toContain("우동 123-4");
  });

  it("질문 목록을 안 넘기면 예전처럼 전부 통과한다 (대행사 화면은 옛 답변도 봐야 한다)", () => {
    const clean = sanitizeApplicantForCompany(applicant);
    expect(clean.custom_answers).toEqual(applicant.custom_answers);
  });

  it("남은 질문이 하나도 없으면 답변도 전부 사라진다", () => {
    const clean = sanitizeApplicantForCompany(applicant, []);
    expect(clean.custom_answers).toEqual({});
  });

  it("광고주에게 나가는 호출부는 모두 질문 목록을 넘긴다", async () => {
    const { readFileSync } = await import("node:fs");
    // 한 곳이라도 빠지면 그 경로로 옛 답변이 다시 새어 나간다.
    // 두 번째 인자로 실제로 넘기는지까지 본다. 함수 참조를 그대로 `.map()` 에 주면
    // map 이 두 번째 인자로 index 를 넣어버리므로, 호출 형태를 정규식으로 못 박는다.
    for (const p of [
      "app/applicants/[token]/page.tsx",
      "app/applicants/[token]/actions.ts",
      "app/api/applicants/export/route.ts",
      "app/seeding-sheet/[token]/page.tsx",
      "app/api/seeding-sheet/export/route.ts",
    ]) {
      const src = readFileSync(p, "utf8");
      expect(src).toMatch(/sanitizeApplicantForCompany\([^)]*,\s*allowedQuestionIds\)/);
      // 그 목록은 **광고주 공개로 표시된 질문만** 이어야 한다. 전체 목록을 넘기면
      // 체크박스를 꺼 둔 질문의 답까지 그대로 나간다.
      expect(src).toContain("questionsSharedWithCompany");
    }
  });
});

/**
 * 안내 메시지 템플릿 탭.
 *
 * 화면 쪽에 종류 목록을 손으로 적고 `as CampaignMessageType[]` 로 캐스팅해 둔 탓에,
 * `shipping` 을 `shipping_or_visit`, `guide` 를 `guideline` 로 잘못 적은 것이 컴파일에서
 * 걸리지 않았다. 그 두 탭은 버튼 글자가 빈칸이고 내용도 안 채워져 **쓸 수 없었다.**
 * 이제 목록을 타입에서 끌어오므로 컴파일러가 잡지만, 캐스팅이 다시 들어오는 것까지는 못 막는다.
 */
describe("안내 메시지 템플릿 종류", () => {
  it("모든 종류에 라벨과 기본 문구가 있다", async () => {
    const { CAMPAIGN_MESSAGE_TYPES, CAMPAIGN_MESSAGE_TYPE_LABELS, DEFAULT_CAMPAIGN_MESSAGE_TEMPLATES } =
      await import("@/lib/db/types");

    expect(CAMPAIGN_MESSAGE_TYPES.length).toBeGreaterThan(0);
    for (const t of CAMPAIGN_MESSAGE_TYPES) {
      // 라벨이 비면 버튼이 빈칸으로 그려진다. 눈에 띄지 않는 고장이라 여기서 못 박는다.
      expect(CAMPAIGN_MESSAGE_TYPE_LABELS[t]?.trim()).toBeTruthy();
      // 기본 문구가 없으면 탭을 눌러도 내용이 안 채워진다.
      expect(DEFAULT_CAMPAIGN_MESSAGE_TEMPLATES[t]?.trim()).toBeTruthy();
    }
  });

  it("화면이 종류 목록을 직접 적지 않고 타입에서 끌어온다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/(dashboard)/campaigns/[id]/applicants/ApplicantTable.tsx", "utf8");
    expect(src).toContain("CAMPAIGN_MESSAGE_TYPES.map");
    // 캐스팅은 컴파일러에게 "확인하지 마라" 는 뜻이다. 이 자리에서 오타를 숨겼던 장본인이다.
    expect(src).not.toContain("as CampaignMessageType[]");
  });
});

/**
 * 광고주가 공유 링크로 파일을 받아간 기록.
 *
 * 링크가 유출됐을 때 "언제부터 몇 건이 나갔나" 를 말할 근거가 전혀 없었다.
 * 다만 **누구인지는 기록하지 않는다.** 광고주는 계정이 없고, IP 를 적어도 같은 사람이
 * PC·노트북·폰에서 받으면 서로 다른 값이 되고 같은 사무실의 다른 사람은 같은 값이 된다.
 * 알 수 없는 것을 적으려고 개인정보를 하나 더 모으지 않는다.
 */
describe.skipIf(!hasTestDb)("광고주 내려받기 기록", () => {
  it("언제·무엇·몇 건만 남고, 신원을 특정할 값은 남지 않는다", async () => {
    const { logCompanyExport, getAuditLogs } = await import("@/lib/db");
    const camp = await createCampaign({
      name: "내려받기기록캠페인",
      company_name: "글로벌브랜드",
      campaign_type: "shipping",
    });

    await logCompanyExport({ campaignId: camp.id, what: "지원자 명단", format: "csv", rows: 32 });

    const logs = await getAuditLogs({ campaign_id: camp.id });
    const entry = logs.find((l) => l.action === "company.exported");
    expect(entry).toBeDefined();
    expect(entry!.actor_type).toBe("company");
    expect(entry!.summary).toContain("32건");
    expect(entry!.summary).toContain("지원자 명단");

    // 신원·열쇠에 해당하는 값이 들어가면 안 된다.
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/); // IP 주소
    expect(serialized).not.toContain(camp.applicants_share_token);
    expect(serialized).not.toContain(camp.apply_form_token);
    expect(entry!.actor_name).toBeNull(); // 광고주는 로그인이 없다
  }, 30_000);

  it("두 내보내기 라우트 모두 토큰으로 받을 때만 기록한다", async () => {
    const { readFileSync } = await import("node:fs");
    // 직원이 자기 화면에서 받는 것까지 남기면 기록이 불어나 정작 이상한 것이 묻힌다.
    for (const p of ["app/api/applicants/export/route.ts", "app/api/seeding-sheet/export/route.ts"]) {
      const src = readFileSync(p, "utf8");
      expect(src).toMatch(/if \(token\) \{\s*await logCompanyExport\(/);
    }
  });
});


/**
 * 커스텀 질문별 "광고주 공개" 표시.
 *
 * 전에는 지원폼에 질문을 추가하면 그 답이 무조건 광고주에게 갔다. 대행사가 "카카오톡 ID",
 * "생년월일", "상세 주소" 같은 걸 물어보는 순간 지원자 전원의 값이 광고주 화면·CSV 로 나갔고,
 * 편집 화면에는 그렇게 된다는 안내가 한 줄도 없었다.
 * 특히 주소는 고정 칸(`shipping_address`)을 막아 뒀는데 커스텀 질문으로 물으면 그 방어가
 * 그대로 우회됐다.
 */
describe("커스텀 질문의 광고주 공개 표시", () => {
  const q = (id: string, share?: boolean): CustomFormQuestion => ({
    id,
    label: id,
    type: "text",
    required: false,
    ...(share === undefined ? {} : { share_with_company: share }),
  });

  it("표시가 없으면 막는다 (모르면 가린다)", async () => {
    const { isSharedWithCompany } = await import("@/lib/db/types");
    // 이 칸이 생기기 전에 저장된 옛 질문, 또는 이 칸을 모르는 코드가 만든 질문.
    // 보이는 쪽으로 읽으면 그런 질문이 조용히 새어 나간다.
    expect(isSharedWithCompany(q("old"))).toBe(false);
    expect(isSharedWithCompany(q("off", false))).toBe(false);
    expect(isSharedWithCompany(q("on", true))).toBe(true);
  });

  it("공개로 표시한 질문만 광고주에게 나간다", async () => {
    const { questionsSharedWithCompany, sanitizeApplicantForCompany } = await import("@/lib/db/types");
    const questions = [q("q_open", true), q("q_secret", false), q("q_old")];

    const shared = questionsSharedWithCompany(questions);
    expect(shared.map((x) => x.id)).toEqual(["q_open"]);

    const applicant = {
      ...fullApplicantForShareTest,
      custom_answers: {
        q_open: "공개해도 되는 답",
        q_secret: "카카오톡 아이디 haneul_0312",
        q_old: "1997-03-12",
      },
    };
    const clean = sanitizeApplicantForCompany(applicant, shared.map((x) => x.id));
    expect(Object.keys(clean.custom_answers || {})).toEqual(["q_open"]);

    const serialized = JSON.stringify(clean);
    expect(serialized).not.toContain("haneul_0312");
    expect(serialized).not.toContain("1997-03-12");
  });

  it("새 질문은 광고주 비공개로 만들어진다", async () => {
    const { readFileSync } = await import("node:fs");
    // 반대로 두면 "카카오톡 ID" 를 물어보며 체크를 깜빡하는 순간 전원의 값이 나간다.
    // 보여줘야 하는 질문은 만들 때 한 번 눌러 주면 된다.
    const src = readFileSync("app/(dashboard)/campaigns/[id]/apply-form/ApplyFormEditor.tsx", "utf8");
    expect(src).toMatch(/share_with_company:\s*false/);
  });
});

const fullApplicantForShareTest: Applicant = {
  id: "app_9",
  campaign_id: "camp_1",
  name: "최서연",
  sns_link: "https://instagram.com/seoyeon",
  nationality: "대한민국",
  contact: "010-5555-6666",
  follower_count: 12000,
  category: "패션",
  agency_memo: "메모",
  shipping_address: "서울시 강남구 1",
  visit_schedule: undefined,
  visit_party_size: undefined,
  custom_answers: {},
  privacy_agreed: true,
  secondary_use_agreed: true,
  status: "applied",
  status_changed_by: "agency",
  status_changed_at: undefined,
  applied_at: "2026-09-01T00:00:00.000Z",
};

/**
 * 화면의 `<option value="...">` 가 실제 타입에 있는 값인가.
 *
 * 오늘 이런 버그를 잡았다: 화면에 종류 목록을 손으로 적고 `as SomeUnion[]` 으로 캐스팅해
 * 뒀는데, `shipping` 을 `shipping_or_visit` 로 잘못 적어도 컴파일러가 통과시켰다. 그 탭
 * 두 개는 글자가 빈칸이고 내용도 안 채워져 **쓸 수 없는 상태로 한참 있었다.**
 *
 * `<select>` 도 같은 모양이다. `e.target.value` 는 `string` 이라 `as CampaignStatus` 로
 * 우겨야 하고, 그러면 `<option value="recruting">` 같은 오타를 아무도 못 잡는다.
 * 증상도 조용하다 — 목록 필터가 그냥 0건이 된다.
 *
 * 화면을 다 뜯어고치는 대신(76군데가 걸리고, 고치다 새 버그를 만들 위험이 더 크다)
 * 여기서 값만 대조한다. **화면에 적힌 선택지 값이 어느 타입에도 없으면 오타다.**
 */
describe("화면 select 의 값이 타입과 맞는가", () => {
  it("하드코딩된 option value 가 전부 실제 타입의 멤버다", async () => {
    const { readFileSync } = await import("node:fs");
    const { CAMPAIGN_STATUSES, APPLICANT_STATUSES, PROGRESS_STAGES, EVENT_STATUSES, RSVP_STATUSES, SNS_PLATFORMS } =
      await import("@/lib/db/validation");
    const { SNS_CONTENT_STATUSES, CAMPAIGN_MESSAGE_TYPES } = await import("@/lib/db/types");
    // 역할은 배열 상수가 없고 Record 로만 있다. 키를 끌어오면 타입이 곧 목록이 된다.
    const { ROLE_LABELS } = await import("@/lib/auth/roles");

    // 어느 타입의 값이든 하나에는 속해야 한다. 어디에도 없으면 오타다.
    const known = new Set<string>([
      ...CAMPAIGN_STATUSES, ...APPLICANT_STATUSES, ...PROGRESS_STAGES, ...EVENT_STATUSES,
      ...RSVP_STATUSES, ...SNS_PLATFORMS, ...SNS_CONTENT_STATUSES, ...CAMPAIGN_MESSAGE_TYPES,
      ...Object.keys(ROLE_LABELS),
      // 타입이 아니라 화면 전용인 값들(정렬 기준, 전체 보기 등). 늘어나면 여기에 적는다.
      "all", "", "latest", "followers", "shipping", "visit", "text", "number", "select", "checkbox",
      "report", "plan", "proposal", "etc",
    ]);

    const files = [
      "app/(dashboard)/campaigns/CampaignsListClient.tsx",
      "app/(dashboard)/campaigns/[id]/events/[eventId]/EventDetailClient.tsx",
      "app/(dashboard)/settings/users/UsersClient.tsx",
      "app/(dashboard)/sns/NewSnsAccountModal.tsx",
      "app/(dashboard)/sns/SnsAccountsListClient.tsx",
      "app/(dashboard)/sns/[id]/SnsAccountDetailClient.tsx",
    ];

    const unknown: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // 문자열 리터럴로 적힌 option 값만 본다. {변수} 로 그리는 것은 이미 타입이 지켜준다.
      for (const m of src.matchAll(/<option\s+value="([^"]*)"/g)) {
        if (!known.has(m[1] ?? "")) unknown.push(`${f}: value="${m[1]}"`);
      }
    }
    expect(unknown).toEqual([]);
  });
});

/**
 * 안내문을 "이 캠페인의 기본 템플릿으로 저장" 할 때 개인정보가 박히지 않는가.
 *
 * 모달의 textarea 에는 `{{이름}}` 이 실제 이름으로 바뀐 **완성된 메시지**가 들어 있다.
 * 그걸 그대로 템플릿으로 저장하던 시절에는, 한 번 저장하면 그 지원자의 이름·SNS·
 * **연락처·배송주소**가 캠페인 템플릿에 박제되고 **그 다음부터 모든 지원자가 남의 주소와
 * 전화번호가 적힌 안내문을 받았다.** 화면에서 되돌릴 방법도 없었다.
 *
 * 이 테스트는 화면 코드가 저장 직전에 치환을 되돌리는지를 소스로 확인한다.
 * 되돌리는 함수 자체의 정확성은 아래 두 번째 테스트가 본다.
 */
describe("안내 메시지 템플릿에 개인정보가 박히지 않는가", () => {
  it("저장 경로가 치환을 되돌린 값을 쓴다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/(dashboard)/campaigns/[id]/applicants/ApplicantTable.tsx", "utf8");
    // 저장할 값은 화면의 msgContent 가 아니라 되돌린 값이어야 한다.
    expect(src).toMatch(/\[msgType\]:\s*depopulateTemplate\(/);
    expect(src).not.toMatch(/\[msgType\]:\s*msgContent\s*\}/);
  });

  it("되돌리기가 8개 치환 항목을 전부 복원한다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/(dashboard)/campaigns/[id]/applicants/ApplicantTable.tsx", "utf8");
    // populateTemplate 이 바꾸는 자리와 depopulateTemplate 이 되돌리는 자리가 같아야 한다.
    // 한쪽에만 항목이 늘면 그 값이 다시 템플릿에 박히기 시작한다.
    // 정규식 대신 함수 본문을 잘라 문자열로 대조한다 — 이 파일에는 이스케이프가 많아 정규식이 읽기 어렵다.
    const cut = (name: string) => {
      const head = "function " + name + "(";
      const at = src.indexOf(head);
      if (at < 0) return "";
      const end = src.indexOf(String.fromCharCode(10) + "function ", at + 1);
      return end < 0 ? src.slice(at) : src.slice(at, end);
    };
    const populate = cut("populateTemplate");
    const depopulate = cut("depopulateTemplate");
    expect(populate).not.toBe("");
    expect(depopulate).not.toBe("");

    // 마감일은 고정 문구라 되돌릴 원본 값이 없다. 의도적으로 뺀다.
    const tokens = ["이름", "SNS", "연락처", "국적", "브랜드명", "캠페인명", "배송주소", "방문일정"];
    const missing = tokens.filter((t) => populate.includes(t) && !depopulate.includes(t));
    expect(missing).toEqual([]);
  });
});

describe("Range 헤더 파싱", () => {
  // `bytes=0-abc` 는 parseInt 가 NaN 을 돌려주는데, 검사가 start 만 보면
  // `end >= size` 도 `start > end` 도 false 라 그대로 통과했다.
  // 저장소(`lib/db/storage.ts`) 쪽은 `storage.test.ts` 가 실제로 돌려서 확인한다.
  // 미디어 라우트는 요청·파일시스템을 다 세워야 해서, 같은 검사가 있는지만 대조한다.
  it("미디어 라우트도 start 와 end 의 NaN 을 모두 거른다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/media/[id]/route.ts", "utf8");
    expect(src.includes('range.replace(/bytes=/, "").split("-")')).toBe(true);
    expect(src.includes("Number.isNaN(start)")).toBe(true);
    expect(src.includes("Number.isNaN(end)")).toBe(true);
  });
});

describe("소스에 날 제어문자가 없는가", () => {
  /**
   * 이 검사를 넣은 이유 — 이 파일의 "검색엔진 색인 차단" 테스트가 **조용히 죽어 있었다.**
   *
   * `/\ballow:/` 로 적으려던 정규식이 언젠가 날 백스페이스(0x08) 한 글자로 바뀌어 있었다.
   * 소스에 절대 없는 문자를 찾는 꼴이라 `.not.toMatch` 는 무엇을 넣어도 통과했다.
   * robots.ts 에 `allow:` 구멍이 나도 아무도 몰랐을 것이다.
   *
   * 같은 사고가 또 있었다. pptx/mp4/webp 매직 바이트를 날것으로 붙여 넣은 파일들인데,
   * NUL 이 들어간 `tests/unit/phase3.test.ts` 는 git 이 아예 **바이너리로** 보는 바람에
   * diff 가 안 보였다. 리뷰에서 걸릴 수가 없다.
   *
   * 고치는 법은 같다 — `\x00` `\x03` `\b` 처럼 **이스케이프로** 적는다. 뜻은 똑같고
   * 눈에 보인다. 탭·개행·캐리지리턴은 정상이므로 뺀다.
   */
  it("탭과 개행 말고는 제어문자가 없다", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const SKIP = new Set([
      "node_modules", ".next", ".git", ".data",
      "test-results", "playwright-report", "coverage",
    ]);
    const EXT = /\.(ts|tsx|js|mjs|json|md|css)$/;
    const OK = new Set([9, 10, 13]); // 탭, 개행, 캐리지리턴

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        if (SKIP.has(name)) return [];
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return walk(p);
        return EXT.test(name) ? [p] : [];
      });

    const offenders: string[] = [];
    for (const file of walk(".")) {
      const bytes = readFileSync(file);
      const found = new Set<number>();
      for (const b of bytes) if (b < 0x20 && !OK.has(b)) found.add(b);
      if (found.size > 0) {
        const codes = [...found].map((b) => `0x${b.toString(16).padStart(2, "0")}`);
        offenders.push(`${file}: ${codes.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
