import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignById,
  getApplicantsByCampaignId,
  getSeedingRecordsByCampaignId,
} from "@/lib/db";
import { seedingSheetToCSV } from "@/lib/seeding/sheetCsv";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return new NextResponse("Missing campaignId", { status: 400 });
  }

  const [campaign, applicants, seedingRecords] = await Promise.all([
    getCampaignById(campaignId),
    getApplicantsByCampaignId(campaignId),
    getSeedingRecordsByCampaignId(campaignId),
  ]);

  if (!campaign) {
    return new NextResponse("Campaign not found", { status: 404 });
  }

  const selectedApplicants = applicants.filter((a) => a.status === "selected");
  const merged = selectedApplicants.map((app) => {
    const seeding = seedingRecords.find((s) => s.applicant_id === app.id) || {
      id: `temp_${app.id}`,
      campaign_id: campaignId,
      applicant_id: app.id,
      progress_stage: "선정완료" as const,
      upload_deadline: null,
      upload_link: null,
      views: 0,
      engagement: 0,
      notes: null,
      updated_at: new Date().toISOString(),
    };
    return { applicant: app, seeding };
  });

  const csv = seedingSheetToCSV(merged);
  const filename = encodeURIComponent(`${campaign.name}_시딩관리시트.csv`);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}