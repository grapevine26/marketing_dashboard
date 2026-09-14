import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
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
import { fileDownloadResponse } from "@/lib/http/fileResponse";
import { sanitizeApplicantForCompany, sanitizeSeedingForCompany } from "@/lib/db/types";

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

  // 토큰(광고주 공유 링크)이 없으면 로그인한 직원이어야 한다.
  // 프록시는 쿠키 유무만 보므로, 가입만 한 대기 계정이나 차단된 계정도 여기까지 온다.
  if (!token) {
    const auth = await requireApiUser();
    if (auth instanceof NextResponse) return auth;
  }

  const campaign = token
    ? await getCampaignByToken("seeding_sheet_share", token)
    : campaignId
    ? await getCampaignById(campaignId)
    : null;

  if (!campaign) {
    return new NextResponse("Campaign not found", { status: 404 });
  }

  const [rawApplicants, rawSeeding] = await Promise.all([
    getApplicantsByCampaignId(campaign.id),
    getSeedingRecordsByCampaignId(campaign.id),
  ]);
  // 광고주 공유 링크로 받는 파일에는 배송지·연락처·내부 비고를 넣지 않는다.
  // 화면(seeding-sheet/[token])과 정확히 같은 기준이다. 화면에서는 빼고 파일에서는 넣으면
  // 파일이 곧 유출 경로가 된다. 배송지는 지원자와 시딩 기록 양쪽에 있어 둘 다 씻는다.
  const applicants = token ? rawApplicants.map(sanitizeApplicantForCompany) : rawApplicants;
  const seedingRecords = token ? rawSeeding.map(sanitizeSeedingForCompany) : rawSeeding;

  const rows = mergeSeedingRows(campaign.id, applicants, seedingRecords);

  if (format === "xlsx") {
    const buffer = await seedingSheetToXlsx(rows, toKstDateString());
    const filename = encodeURIComponent(`${campaign.name}_시딩관리시트.xlsx`);

    return fileDownloadResponse(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
  }

  const csv = seedingSheetToCSV(rows, toKstDateString());
  const filename = encodeURIComponent(`${campaign.name}_시딩관리시트.csv`);

  return fileDownloadResponse(Buffer.from(csv, "utf-8"), "text/csv; charset=utf-8", filename);
}
