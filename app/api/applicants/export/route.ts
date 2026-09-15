import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { getCampaignById, getCampaignByToken, getApplicantsByCampaignId, getFormConfig, logCompanyExport } from "@/lib/db";
import { applicantsToCSV } from "@/lib/applicants/csv";
import { applicantsToXlsx } from "@/lib/applicants/xlsx";
import { fileDownloadResponse } from "@/lib/http/fileResponse";
import { sanitizeApplicantForCompany, questionsSharedWithCompany } from "@/lib/db/types";

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

  // 토큰(광고주 공유 링크)으로 받는 경우, 캠페인이 끝났으면 파일도 주지 않는다.
  // 화면은 닫고 파일은 열어 두면 파일이 곧 우회 경로가 된다.
  if (token && campaign.status === "completed") {
    return new NextResponse("종료된 캠페인입니다.", { status: 403 });
  }

  const [rawApplicants, formConfig] = await Promise.all([
    getApplicantsByCampaignId(campaign.id),
    getFormConfig(campaign.id),
  ]);

  // 광고주에게 나가는 파일은 개인정보를 먼저 지운 값으로 만든다.
  //
  // 아래 생성기에도 `includeContact: !token` 조건이 있지만, 그건 컬럼을 고를 뿐이라
  // 새 개인정보 컬럼을 추가하는 날 조용히 실려 나간다. 값 자체를 비워 두면 그 실수가 무해해진다.
  // 화면(app/applicants/[token])과 같은 함수를 쓰는 것이기도 하다.
  //
  // 현재 질문 목록을 같이 넘겨 지워진 질문의 옛 답변이 파일에 실리지 않게 한다.
  // 생성기는 현재 질문만 컬럼으로 만들지만, 값 자체를 지워 두면 컬럼 고르기가 바뀌어도 안전하다.
  // `.map(sanitizeApplicantForCompany)` 로 넘기면 안 된다 — map 이 두 번째 인자로 index 를 준다.
  // **광고주에게 공개로 표시된 질문만** 남긴다. 표시가 없으면 막는다(모르면 가린다).
  // 컬럼을 고를 때와 값을 지울 때 같은 목록을 써야 한다. 한쪽만 걸면 질문 제목은 보이는데
  // 답이 빈칸인 표가 나가서, 오히려 "뭔가 숨겼구나" 가 드러난다.
  const customQuestions = token
    ? questionsSharedWithCompany(formConfig?.custom_questions || [])
    : formConfig?.custom_questions || [];
  const allowedQuestionIds = customQuestions.map((q) => q.id);
  const applicants = token
    ? rawApplicants.map((a) => sanitizeApplicantForCompany(a, allowedQuestionIds))
    : rawApplicants;

  // 광고주가 받아간 것만 남긴다. 직원이 자기 화면에서 받는 것은 기록할 이유가 없다.
  if (token) {
    await logCompanyExport({
      campaignId: campaign.id,
      what: "지원자 명단",
      format: format === "xlsx" ? "xlsx" : "csv",
      rows: applicants.length,
    });
  }

  if (format === "xlsx") {
    const buffer = await applicantsToXlsx(applicants, customQuestions, {
      includeContact: !token,
    });
    const filename = encodeURIComponent(`${campaign.name}_지원자리스트.xlsx`);

    return fileDownloadResponse(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
  }

  const csv = applicantsToCSV(applicants, customQuestions, {
    includeContact: !token,
  });
  const filename = encodeURIComponent(`${campaign.name}_지원자리스트.csv`);

  return fileDownloadResponse(Buffer.from(csv, "utf-8"), "text/csv; charset=utf-8", filename);
}
