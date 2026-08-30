import { NextRequest, NextResponse } from "next/server";
import { getCampaignById, getApplicantsByCampaignId } from "@/lib/db";
import { applicantsToCSV } from "@/lib/applicants/csv";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return new NextResponse("Missing campaignId", { status: 400 });
  }

  const [campaign, applicants] = await Promise.all([
    getCampaignById(campaignId),
    getApplicantsByCampaignId(campaignId),
  ]);

  if (!campaign) {
    return new NextResponse("Campaign not found", { status: 404 });
  }

  const csv = applicantsToCSV(applicants);
  const filename = encodeURIComponent(`${campaign.name}_지원자리스트.csv`);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}