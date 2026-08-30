import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCampaignById,
  getApplicantsByCampaignId,
  getSeedingRecordsByCampaignId,
  getPreSurveyResponse,
  getCampaignFormConfig,
} from "@/lib/db";
import TokenShareBox from "./TokenShareBox";
import {
  FileQuestion,
  FileText,
  Users,
  TableProperties,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Sparkles,
  Building2,
  Truck,
} from "lucide-react";

export const revalidate = 0;

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const [applicants, seedingRecords, preSurvey, formConfig] = await Promise.all([
    getApplicantsByCampaignId(id),
    getSeedingRecordsByCampaignId(id),
    getPreSurveyResponse(id),
    getCampaignFormConfig(id),
  ]);

  const selectedCount = applicants.filter((a) => a.status === "selected").length;
  const completedUploads = seedingRecords.filter(
    (s) => s.progress_stage === "업로드완료" || Boolean(s.upload_link)
  ).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      {/* Campaign Header */}
      <div className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
              {campaign.campaign_type === "shipping" ? "배송형" : "방문형"}
            </span>
            <span className="text-xs text-zinc-400 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-zinc-500" />
              {campaign.company_name}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">{campaign.name}</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-zinc-500 block">지원자 / 최종선정</span>
            <span className="text-sm font-bold text-zinc-200">
              {applicants.length}명 / <strong className="text-blue-400">{selectedCount}명</strong>
            </span>
          </div>
          <div className="h-8 w-px bg-[#22242A]" />
          <div className="text-right">
            <span className="text-xs text-zinc-500 block">업로드 완주</span>
            <span className="text-sm font-bold text-emerald-400">
              {completedUploads}건
            </span>
          </div>
        </div>
      </div>

      {/* 4 Public Token Share Links */}
      <TokenShareBox campaign={campaign} />

      {/* 5-Step Workflow Cards */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
          시딩 5단계 워크플로우
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Step 1: Pre-Survey */}
          <Link
            href={`/campaigns/${campaign.id}/pre-survey`}
            className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <FileQuestion className="w-4 h-4" />
                </div>
                {preSurvey ? (
                  <span className="text-[11px] font-semibold text-blue-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 회신완료
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> 미작성
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100 group-hover:text-blue-400 transition">
                  1. 사전조사 (Pre-Survey)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  광고주 브랜드 희망사항 파악 및 Gemini AI 답변 추천
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-[#22242A] flex items-center justify-between text-xs text-blue-400 font-semibold">
              <span>사전조사 관리</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          {/* Step 2: Apply Form */}
          <Link
            href={`/campaigns/${campaign.id}/apply-form`}
            className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-blue-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> AI 모집글 생성
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100 group-hover:text-blue-400 transition">
                  2. 신청폼 설정 (Apply Form)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  인플루언서 모집 소개글, 필수 항목 및 커스텀 질문 설정
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-[#22242A] flex items-center justify-between text-xs text-blue-400 font-semibold">
              <span>신청폼 에디터</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          {/* Step 3: Applicants */}
          <Link
            href={`/campaigns/${campaign.id}/applicants`}
            className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-zinc-300">
                  총 {applicants.length}명 접수
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100 group-hover:text-blue-400 transition">
                  3. 지원자 리스트 & 선정
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  중복 지원 감지, 최종선정/예비선정 및 광고주 실시간 공유
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-[#22242A] flex items-center justify-between text-xs text-blue-400 font-semibold">
              <span>지원자 심사</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          {/* Step 4: Seeding Sheet */}
          <Link
            href={`/campaigns/${campaign.id}/seeding-sheet`}
            className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <TableProperties className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-blue-400">
                  {selectedCount}명 진행중
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100 group-hover:text-blue-400 transition">
                  4. 시딩 관리시트
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  송장/방문 단계 추적, D-Day 계산, 업로드 링크 및 조회수 입력
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-[#22242A] flex items-center justify-between text-xs text-blue-400 font-semibold">
              <span>관리시트 열기</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          {/* Step 5: Reports */}
          <Link
            href={`/campaigns/${campaign.id}/reports`}
            className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-zinc-300">
                  PDF & PPTX
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100 group-hover:text-blue-400 transition">
                  5. 결과보고서
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  성과 스냅샷, 총평 작성, 한글 PDF 및 편집 가능한 PPTX 다운로드
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-[#22242A] flex items-center justify-between text-xs text-blue-400 font-semibold">
              <span>보고서 생성</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}