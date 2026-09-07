import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCampaignById,
  getApplicantsByCampaignId,
  getSeedingRecordsByCampaignId,
  getPreSurveyResponse,
  getFormConfig,
  getEventsByCampaignId,
  getAuditLogs,
} from "@/lib/db";
import TokenShareBox from "./TokenShareBox";
import CampaignStatusSelect from "./CampaignStatusSelect";
import CampaignIntegrationsCard from "./CampaignIntegrationsCard";
import {
  FileQuestion,
  FileText,
  Users,
  TableProperties,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  Building2,
  PartyPopper,
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

  const [applicants, seedingRecords, preSurvey, formConfig, events, auditLogs] = await Promise.all([
    getApplicantsByCampaignId(id),
    getSeedingRecordsByCampaignId(id),
    getPreSurveyResponse(id),
    getFormConfig(id),
    getEventsByCampaignId(id),
    getAuditLogs({ campaign_id: id, limit: 10 }),
  ]);

  const selectedIds = new Set(applicants.filter((a) => a.status === "selected").map((a) => a.id));
  const selectedCount = selectedIds.size;
  const completedUploads = seedingRecords.filter(
    (s) => selectedIds.has(s.applicant_id) && (s.progress_stage === "업로드완료" || Boolean(s.upload_link))
  ).length;

  const steps = [
    {
      href: `/campaigns/${campaign.id}/pre-survey`,
      icon: FileQuestion,
      badge: preSurvey ? (
        <span className="text-[11px] font-semibold text-blue-400 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> 회신완료
        </span>
      ) : (
        <span className="text-[11px] text-text-muted flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> 미작성
        </span>
      ),
      title: "1. 사전조사 (Pre-Survey)",
      desc: "광고주 브랜드 희망사항 파악 및 Gemini AI 답변 추천",
      cta: "사전조사 관리",
    },
    {
      href: `/campaigns/${campaign.id}/apply-form`,
      icon: FileText,
      badge: (
        <span className={`text-[11px] font-semibold flex items-center gap-1 ${formConfig?.is_published === false ? "text-amber-400" : "text-blue-400"}`}>
          <Sparkles className="w-3.5 h-3.5" /> {formConfig?.is_published === false ? "접수 중단" : "접수중"}
        </span>
      ),
      title: "2. 신청폼 설정 (Apply Form)",
      desc: "인플루언서 모집 소개글, 필수 항목 및 커스텀 질문 설정",
      cta: "신청폼 에디터",
    },
    {
      href: `/campaigns/${campaign.id}/applicants`,
      icon: Users,
      badge: <span className="text-[11px] font-semibold text-text-2">총 {applicants.length}명 접수</span>,
      title: "3. 지원자 리스트 & 선정",
      desc: "중복 지원 감지, 최종선정/예비선정 및 광고주 실시간 공유",
      cta: "지원자 심사",
    },
    {
      href: `/campaigns/${campaign.id}/seeding-sheet`,
      icon: TableProperties,
      badge: <span className="text-[11px] font-semibold text-blue-400">{selectedCount}명 진행중</span>,
      title: "4. 시딩 관리시트",
      desc: "송장/방문 단계 추적, D-Day 계산, 업로드 링크 및 조회수 입력",
      cta: "관리시트 열기",
    },
    {
      href: `/campaigns/${campaign.id}/reports`,
      icon: FileSpreadsheet,
      badge: <span className="text-[11px] font-semibold text-text-2">PDF & PPTX</span>,
      title: "5. 결과보고서",
      desc: "성과 스냅샷, 총평 작성, 한글 PDF 및 편집 가능한 PPTX 다운로드",
      cta: "보고서 생성",
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      {/* Campaign Header */}
      <div className="p-6 rounded-3xl bg-surface border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
              {campaign.campaign_type === "shipping" ? "배송형" : "방문형"}
            </span>
            <span className="text-xs text-text-sub flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-text-muted" />
              {campaign.company_name}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-text">{campaign.name}</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-text-muted block">지원자 / 최종선정</span>
            <span className="text-sm font-bold text-text font-mono tabular-nums">
              {applicants.length}명 / <strong className="text-blue-400">{selectedCount}명</strong>
            </span>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-right">
            <span className="text-xs text-text-muted block">업로드 완주</span>
            <span className="text-sm font-bold text-emerald-400 font-mono tabular-nums">{completedUploads}건</span>
          </div>
          <div className="h-8 w-px bg-border" />
          <CampaignStatusSelect campaignId={campaign.id} initialStatus={campaign.status} />
        </div>
      </div>

      <TokenShareBox campaign={campaign} />

      {/* Event Section Entry */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-indigo-950/30 to-surface border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
            <PartyPopper className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-text">캠페인 연계 인플루언서 행사</h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                {events.length}개 행사
              </span>
            </div>
            <p className="text-xs text-text-sub mt-0.5">
              브랜드 VIP 런칭 파티, 팝업스토어 초청(RSVP), 운영안 PPT 및 준비 체크리스트 관리
            </p>
          </div>
        </div>

        <Link
          href={`/campaigns/${campaign.id}/events`}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition active:scale-95 shrink-0"
        >
          <span>행사 관리 허브 바로가기</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 5-Step Workflow Cards */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-text-sub uppercase tracking-wider">시딩 5단계 워크플로우</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Link
                key={step.href}
                href={step.href}
                className="p-5 rounded-2xl bg-surface border border-border hover:border-blue-500/40 hover:bg-surface2 transition flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                      <Icon className="w-4 h-4" />
                    </div>
                    {step.badge}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text group-hover:text-blue-400 transition">{step.title}</h3>
                    <p className="text-xs text-text-sub mt-0.5">{step.desc}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-blue-400 font-semibold">
                  <span>{step.cta}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Webhook Integrations & Audit Log */}
      <CampaignIntegrationsCard
        campaignId={campaign.id}
        initialWebhookUrl={campaign.webhook_url}
        auditLogs={auditLogs}
      />
    </div>
  );
}
