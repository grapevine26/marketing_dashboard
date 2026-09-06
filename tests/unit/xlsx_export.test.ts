import { describe, it, expect } from "vitest";
import { applicantsToXlsx } from "@/lib/applicants/xlsx";
import { seedingSheetToXlsx } from "@/lib/seeding/sheetXlsx";
import { Applicant, SeedingRecord } from "@/lib/db/types";

describe("3-3. XLSX Export for Global Agency & Client Reporting", () => {
  const dummyApplicant: Applicant = {
    id: "app-1",
    campaign_id: "camp-1",
    name: "김글로벌",
    sns_link: "https://instagram.com/global_creator",
    nationality: "대한민국",
    contact: "010-1234-5678",
    follower_count: 52000,
    category: "뷰티",
    agency_memo: "글로벌 캠페인 메인 피드 추천",
    shipping_address: "서울시 강남구 영동대로 123",
    custom_answers: { q1: "건성", q2: true },
    privacy_agreed: true,
    secondary_use_agreed: true,
    status: "selected",
    status_changed_by: "agency",
    status_changed_at: "2026-09-07T00:00:00.000Z",
    applied_at: "2026-09-06T12:00:00.000Z",
  };

  const dummySeeding: SeedingRecord = {
    id: "seed-1",
    campaign_id: "camp-1",
    applicant_id: "app-1",
    progress_stage: "발송완료",
    upload_deadline: "2026-09-15",
    upload_link: "https://instagram.com/p/C12345",
    views: 12500,
    engagement: 1450,
    notes: "우수 퀄리티 기대",
    created_at: "2026-09-07T00:00:00.000Z",
  };

  it("generates valid XLSX buffer for applicants with full contact and custom questions", async () => {
    const customQuestions = [
      { id: "q1", label: "피부타입", type: "select" as const, required: true },
      { id: "q2", label: "촬영가능여부", type: "checkbox" as const, required: false },
    ];

    const buffer = await applicantsToXlsx([dummyApplicant], customQuestions, { includeContact: true });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);

    // ZIP/XLSX magic number: PK (0x50, 0x4B)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("generates sanitized XLSX buffer without personal contact info for client share links", async () => {
    const buffer = await applicantsToXlsx([dummyApplicant], [], { includeContact: false });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("generates valid XLSX buffer for seeding sheet with formatted metrics", async () => {
    const buffer = await seedingSheetToXlsx([{ applicant: dummyApplicant, seeding: dummySeeding }], "2026-09-07");
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});
