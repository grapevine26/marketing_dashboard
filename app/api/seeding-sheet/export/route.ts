import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignById,
  getCampaignByToken,
  getApplicantsByCampaignId,
  getSeedingRecordsByCampaignId,
} from "@/lib/db";
import { seedingSheetToCSV } from "@/lib/seeding/sheetCsv";
import { seedingSheetToXlsx } from "@/lib/seeding/sheetXlsx";
import { mergeSeedingRows } from "@/lib/seeding/rows";
import { toKstDateString } from "@/lib/seeding/dday";

/**
 * 관리시트 데이터 내보내기 (CSV 및 Excel .xlsx).
 * `?campaignId=`(대시보드) 또는 `?token=`(seeding_sheet_share 공유 토큰).
 * `?format=xlsx`: 엑셀 서식 파일 다운로드 (기본값: csv).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");
  const token = searchParams.get("token");
  const format = searchParams.get("format");

  const campaign = token
    ? await getCampaignByToken("seeding_sheet_share", token)
    : campaignId
    ? await getCampaignById(campaignId)
    : null;

  if (!campaign) {
    return new NextResponse("Campaign not found", { status: 404 });
  }

  const [applicants, seedingRecords] = await Promise.all([
    getApplicantsByCampaignId(campaign.id),
    getSeedingRecordsByCampaignId(campaign.id),
  ]);

  const rows = mergeSeedingRows(campaign.id, applicants, seedingRecords);

  if (format === "xlsx") {
    const buffer = await seedingSheetToXlsx(rows, toKstDateString());
    const filename = encodeURIComponent(`${campaign.name}_시딩관리시트.xlsx`);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = seedingSheetToCSV(rows, toKstDateString());
  const filename = encodeURIComponent(`${campaign.name}_시딩관리시트.csv`);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
