import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCampaignById,
  getPreSurveyResponse,
  getCampaignFormConfig,
  getApplicantsByCampaignId,
  getSeedingRecordsByCampaignId,
  getReportsByCampaignId,
} from "@/lib/db";
import {
  Building2,
  Truck,
  MapPin,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import TokenShareBox from "./TokenShareBox";

export const revalidate = 0;

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const [preSurvey, formConfig, applicants, seedingRecords, reports] =
    await Promise.all([
      getPreSurveyResponse(id),
      getCampaignFormConfig(id),
      getApplicantsByCampaignId(id),
      getSeedingRecordsByCampaignId(id),
      getReportsByCampaignId(id),
    ]);

  const selectedCount = applicants.filter((a) => a.status === "selected").length;
  const uploadCompletedCount = seedingRecords.filter(
    (s) => s.progress_stage === "업로드완료" || Boolean(s.upload_link)
  ).length;

  return (
    <div className="space-y-8">
      {/* Campaign Header */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                campaign.campaign_type === "shipping"
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
              }`}
            >
              {campaign.campaign_type === "shipping" ? (
                <>
                  <Truck className="w-3 h-3" /> 제품배송형
                </>
              ) : (
                <>
                  <MapPin className="w-3 h-3" /> 현장방문형
                </>
              )}
            </span>
            <span className="text-xs text-slate-400">
              생성일: {new Date(campaign.created_at).toLocaleDateString("ko-KR")}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
          <p className="text-sm text-slate-400 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            <span>광고주: {campaign.company_name}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-center">
            <div className="text-xs text-slate-400">총 지원자</div>
            <div className="text-lg font-bold text-blue-400">{applicants.length}명</div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-center">
            <div className="text-xs text-slate-400">최종선정</div>
            <div className="text-lg font-bold text-emerald-400">{selectedCount}명</div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-center">
            <div className="text-xs text-slate-400">업로드완료</div>
            <div className="text-lg font-bold text-purple-400">{uploadCompletedCount}건</div>
          </div>
        </div>
      </div>

      {/* 4 Public Tokens Share Section */}
      <TokenShareBox campaign={campaign} />

      {/* 5-Step Workflow Cards */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <span>단계별 시딩 워크플로우</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Step 1: Pre-survey */}
          <Link
            href={`/campaigns/${campaign.id}/pre-survey`}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/80 transition flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold">
                  1
                </div>
                {preSurvey ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 답변완료
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">미작성</span>
                )}
              </div>
              <div>
                <h3 className="font-bold text-white text-base">사전조사 관리</h3>
                <p className="text-xs text-slate-400 mt-1">
                  광고주 요구사항 수집 및 에이전시 대리 작성 (Gemini AI 답변 추천)
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-blue-400">
              <span>사전조사 바로가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          {/* Step 2: Apply Form */}
          <Link
            href={`/campaigns/${campaign.id}/apply-form`}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/80 transition flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold">
                  2
                </div>
                {formConfig?.is_published ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 게시중
                  </span>
                ) : (
                  <span className="text-xs text-amber-400">설정필요</span>
                )}
              </div>
              <div>
                <h3 className="font-bold text-white text-base">신청폼 설정</h3>
                <p className="text-xs text-slate-400 mt-1">
                  AI 인플루언서 모집글 초안 생성 및 커스텀 문항 구성
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-indigo-400">
              <span>신청폼 에디터 바로가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          {/* Step 3: Applicants */}
          <Link
            href={`/campaigns/${campaign.id}/applicants`}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/80 transition flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                  3
                </div>
                <span className="text-xs text-slate-300 font-medium">
                  지원자 {applicants.length}명
                </span>
              </div>
              <div>
                <h3 className="font-bold text-white text-base">지원자 리스트 & 선정</h3>
                <p className="text-xs text-slate-400 mt-1">
                  지원서 검토, 최종선정/예비선정, 중복 감지 및 CSV 다운로드
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-emerald-400">
              <span>지원자 관리 바로가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          {/* Step 4: Seeding Sheet */}
          <Link
            href={`/campaigns/${campaign.id}/seeding-sheet`}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/80 transition flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                  4
                </div>
                <span className="text-xs text-slate-300 font-medium">
                  선정인원 {selectedCount}명
                </span>
              </div>
              <div>
                <h3 className="font-bold text-white text-base">시딩 관리시트</h3>
                <p className="text-xs text-slate-400 mt-1">
                  진행단계 체크리스트, D-day 계산, 링크 및 조회수/인게이지먼트 기록
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-amber-400">
              <span>시딩 시트 바로가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          {/* Step 5: Reports */}
          <Link
            href={`/campaigns/${campaign.id}/reports`}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/80 transition flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold">
                  5
                </div>
                <span className="text-xs text-slate-300 font-medium">
                  보고서 {reports.length}건
                </span>
              </div>
              <div>
                <h3 className="font-bold text-white text-base">결과보고서 생성</h3>
                <p className="text-xs text-slate-400 mt-1">
                  성과 스냅샷, 커스텀 섹션 편집, PDF 및 파워포인트(PPTX) 다운로드
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-purple-400">
              <span>결과보고서 관리 바로가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}