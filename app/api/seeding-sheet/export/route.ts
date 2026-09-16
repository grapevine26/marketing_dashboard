import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import {
  getCampaignById,
  getCampaignByToken,
  getApplicantsByCampaignId,
  getSeedingRecordsByCampaignId,
  getFormConfig,
  logCompanyExport,
} from "@/lib/db";
import { seedingSheetToCSV } from "@/lib/seeding/sheetCsv";
import { seedingSheetToXlsx } from "@/lib/seeding/sheetXlsx";
import { mergeSeedingRows } from "@/lib/seeding/rows";
import { toKstDateString } from "@/lib/seeding/dday";
import { fileDownloadResponse } from "@/lib/http/fileResponse";
import {
  PUBLIC_BY_LINK,
  PUBLIC_SUBMIT,
  getClientIp,
  hitThrottle,
  isThrottled,
  publicLinkKey,
  publicSubmitKey,
} from "@/lib/security/throttle";
import { sanitizeApplicantForCompany, sanitizeSeedingForCompany, questionsSharedWithCompany } from "@/lib/db/types";

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

  // 토큰(광고주 공유 링크)으로 받는 경우, 캠페인이 끝났으면 파일도 주지 않는다.
  // 화면은 닫고 파일은 열어 두면 파일이 곧 우회 경로가 된다.
  if (token && campaign.status === "completed") {
    return new NextResponse("종료된 캠페인입니다.", { status: 403 });
  }

  // 토큰으로 오는 요청에만 횟수 제한을 건다. 로그인한 직원이 자기 화면에서 받는 것은 셀 이유가 없다.
  //
  // 이 응답은 **캠페인 전체 명단**이고, 호출마다 감사 로그가 한 줄씩 쌓인다(아래 logCompanyExport).
  // 링크가 단톡방이나 메일로 새면 그 하나로 명단을 무제한으로 받아갈 수 있고,
  // 그 사이 감사 로그가 부풀어 진짜 기록이 묻힌다.
  //
  // 키를 둘 쓴다. (링크+IP) 는 평범한 남용을 막고, 링크 전체 상한은 IP 를 바꿔가며
  // 우회하는 것을 막는다. 후자가 진짜 천장이다.
  if (token) {
    const 제한키 = [publicSubmitKey("exportseeding", token, await getClientIp()), publicLinkKey("exportseeding", token)];
    if (await isThrottled(제한키)) {
      return new NextResponse("단시간에 너무 많이 내려받았습니다. 잠시 후 다시 시도해주세요.", { status: 429 });
    }
    // 서로 다른 행이라 순서가 없다. 줄줄이 기다릴 이유가 없다.
    await Promise.all([hitThrottle(제한키[0]!, PUBLIC_SUBMIT), hitThrottle(제한키[1]!, PUBLIC_BY_LINK)]);
  }

  const [rawApplicants, rawSeeding, formConfig] = await Promise.all([
    getApplicantsByCampaignId(campaign.id),
    getSeedingRecordsByCampaignId(campaign.id),
    getFormConfig(campaign.id),
  ]);
  // 광고주 공유 링크로 받는 파일에는 배송지·연락처·내부 비고를 넣지 않는다.
  // 화면(seeding-sheet/[token])과 정확히 같은 기준이다. 화면에서는 빼고 파일에서는 넣으면
  // 파일이 곧 유출 경로가 된다. 배송지는 지원자와 시딩 기록 양쪽에 있어 둘 다 씻는다.
  //
  // 지워진 질문의 옛 답변도 같은 이유로 뺀다. 이 파일은 커스텀 답변 컬럼을 만들지 않지만,
  // 기준이 화면과 달라지는 순간 파일이 다시 우회 경로가 된다.
  // `.map(sanitizeApplicantForCompany)` 로 넘기면 안 된다 — map 이 두 번째 인자로 index 를 준다.
  const allowedQuestionIds = questionsSharedWithCompany(formConfig?.custom_questions || []).map((q) => q.id);
  const applicants = token
    ? rawApplicants.map((a) => sanitizeApplicantForCompany(a, allowedQuestionIds))
    : rawApplicants;
  // 시딩 기록도 화살표로 감싼다. 지금은 인자가 하나뿐이지만, 나중에 인자가 늘면
  // 함수 참조를 그대로 넘긴 곳이 index 를 받아 조용히 깨진다.
  const seedingRecords = token ? rawSeeding.map((s) => sanitizeSeedingForCompany(s)) : rawSeeding;

  const rows = mergeSeedingRows(campaign.id, applicants, seedingRecords);

  // 광고주가 받아간 것만 남긴다. 직원이 자기 화면에서 받는 것은 기록할 이유가 없다.
  if (token) {
    await logCompanyExport({
      campaignId: campaign.id,
      what: "배송/방문 관리시트",
      format: format === "xlsx" ? "xlsx" : "csv",
      rows: rows.length,
    });
  }

  if (format === "xlsx") {
    const buffer = await seedingSheetToXlsx(rows, toKstDateString());
    const filename = encodeURIComponent(`${campaign.name}_시딩관리시트.xlsx`);

    return fileDownloadResponse(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
  }

  const csv = seedingSheetToCSV(rows, toKstDateString());
  const filename = encodeURIComponent(`${campaign.name}_시딩관리시트.csv`);

  return fileDownloadResponse(Buffer.from(csv, "utf-8"), "text/csv; charset=utf-8", filename);
}
