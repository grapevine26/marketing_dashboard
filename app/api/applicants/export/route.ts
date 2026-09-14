import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { getCampaignById, getCampaignByToken, getApplicantsByCampaignId, getFormConfig } from "@/lib/db";
import { applicantsToCSV } from "@/lib/applicants/csv";
import { applicantsToXlsx } from "@/lib/applicants/xlsx";
import { fileDownloadResponse } from "@/lib/http/fileResponse";

/**
 * 지원자 데이터 내보내기 (CSV 및 Excel .xlsx).
 * - `?campaignId=`: 대시보드용(연락처·주소 포함)
 * - `?token=`: 광고주 공유 링크용(applicants_share 토큰, 개인정보 컬럼 제외)
 * - `?format=xlsx`: 엑셀 서식 파일 다운로드 (기본값: csv)
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
    ? await getCampaignByToken("applicants_share", token)
    : campaignId
    ? await getCampaignById(campaignId)
    : null;

  if (!campaign) {
    return new NextResponse("Campaign not found", { status: 404 });
  }

  const [applicants, formConfig] = await Promise.all([
    getApplicantsByCampaignId(campaign.id),
    getFormConfig(campaign.id),
  ]);

  if (format === "xlsx") {
    const buffer = await applicantsToXlsx(applicants, formConfig?.custom_questions || [], {
      includeContact: !token,
    });
    const filename = encodeURIComponent(`${campaign.name}_지원자리스트.xlsx`);

    return fileDownloadResponse(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
  }

  const csv = applicantsToCSV(applicants, formConfig?.custom_questions || [], {
    includeContact: !token,
  });
  const filename = encodeURIComponent(`${campaign.name}_지원자리스트.csv`);

  return fileDownloadResponse(Buffer.from(csv, "utf-8"), "text/csv; charset=utf-8", filename);
}
