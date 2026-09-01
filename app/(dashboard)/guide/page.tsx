import Link from "next/link";
import {
  BookOpen,
  Sparkles,
  FolderKanban,
  PartyPopper,
  Camera,
  Calendar,
  Settings,
  ArrowRight,
  CheckCircle2,
  FileQuestion,
  FileText,
  Users,
  TableProperties,
  FileSpreadsheet,
  Download,
  Share2,
  Sliders,
  Presentation,
  CheckSquare,
  Clock,
  Layers,
  HelpCircle,
  Zap,
} from "lucide-react";

export const revalidate = 0;

export default function GuidePage() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 font-sans pb-16">
      {/* Hero Banner */}
      <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-[#131418] via-[#181A20] to-[#0D0E12] border border-[#22242A] space-y-4 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold">
          <BookOpen className="w-3.5 h-3.5" />
          <span>마케팅 올인원 종합 사용 매뉴얼</span>
        </div>

        <h1 className="text-2xl sm:text-4xl font-extrabold text-zinc-100 tracking-tight leading-tight">
          처음 오셨나요? <br />
          <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
            마케팅 올인원 대시보드 완벽 가이드
          </span>
        </h1>

        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-3xl">
          본 플랫폼은 <strong>인플루언서 시딩 체험단</strong>, <strong>인플루언서 초청 행사(RSVP)</strong>, 
          <strong>SNS 공식 채널 대행 운영</strong>의 모든 과정을 하나의 화면에서 관리하고, 
          <strong>Gemini AI</strong>와 <strong>파워포인트(.pptx) 자동 생성 엔진</strong>을 통해 업무 효율을 극대화하는 종합 마케팅 솔루션입니다.
        </p>

        <div className="pt-2 flex flex-wrap gap-2.5">
          <a
            href="#quick-start"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md"
          >
            🚀 빠른 시작 1분 요약
          </a>
          <a
            href="#seeding"
            className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold transition"
          >
            1. 인플루언서 시딩 5단계
          </a>
          <a
            href="#events"
            className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold transition"
          >
            2. 인플루언서 행사
          </a>
          <a
            href="#sns"
            className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold transition"
          >
            3. SNS 공식 채널 운영
          </a>
          <a
            href="#overview"
            className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold transition"
          >
            4. 통합 캘린더 & 알림
          </a>
        </div>
      </div>

      {/* Quick Start Summary */}
      <section id="quick-start" className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-bold text-zinc-100">🚀 빠른 시작 (Quick Start)</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-extrabold text-sm">
              1
            </div>
            <h3 className="text-sm font-bold text-zinc-100">체험단 시딩이 필요할 때</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              [인플루언서 시딩] → [새 시딩 캠페인 생성] 후 사전조사 링크와 지원폼 링크를 광고주 및 인플루언서에게 배포하세요.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-extrabold text-sm">
              2
            </div>
            <h3 className="text-sm font-bold text-zinc-100">행사/팝업 초청이 필요할 때</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              [인플루언서 행사]에서 행사를 개설하고 지원자를 1초 만에 초청 명단으로 불러와 현장 체크인과 PPT 운영안을 완성하세요.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center font-extrabold text-sm">
              3
            </div>
            <h3 className="text-sm font-bold text-zinc-100">SNS 공식 채널을 운영할 때</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              [SNS 채널 운영]에서 계정을 등록하고 사전설문 전송, 월별 콘텐츠 캘린더 발행, 클라이언트 승인 링크를 공유하세요.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 1: Seeding 5-Step Workflow */}
      <section id="seeding" className="space-y-6 pt-6 border-t border-[#22242A]">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-400">
            <FolderKanban className="w-4 h-4" />
            <span>서브프로젝트 A</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100">1. 인플루언서 시딩 5단계 워크플로우 완벽 가이드</h2>
          <p className="text-xs text-zinc-400">
            사전조사부터 최종 결과보고서 출력까지 시딩 전 과정을 5개 단계로 완벽히 분절하여 자동화합니다.
          </p>
        </div>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">1</span>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <span>사전조사 (Pre-Survey)</span>
                <span className="text-[11px] text-blue-400 font-normal">광고주 브랜드 요구사항 파악</span>
              </h3>
            </div>
            <div className="text-xs text-zinc-300 space-y-1.5 pl-8.5">
              <p>• <strong>어떻게 사용하나요?</strong> 캠페인 허브 상단의 <code>[사전조사 링크 복사]</code>를 눌러 광고주에게 전달합니다.</p>
              <p>• <strong>광고주 혜택:</strong> 로그인 없이 링크만 열면 질문에 답변할 수 있으며, <strong>[Gemini AI 답변 추천]</strong> 버튼을 누르면 브랜드와 제품에 맞는 전문적인 문안을 AI가 대신 써줍니다.</p>
              <p>• 회신된 답변은 내부 <code>/campaigns/[id]/pre-survey</code>에서 실시간 확인 및 수정할 수 있습니다.</p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">2</span>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <span>신청폼 설정 (Apply Form)</span>
                <span className="text-[11px] text-blue-400 font-normal">인플루언서 공개 모집폼 설정</span>
              </h3>
            </div>
            <div className="text-xs text-zinc-300 space-y-1.5 pl-8.5">
              <p>• <strong>어떻게 사용하나요?</strong> <code>[2. 신청폼 설정]</code> 메뉴로 이동합니다.</p>
              <p>• <strong>AI 소개글 생성:</strong> <strong>[Gemini AI 지원폼 소개글 자동생성]</strong>을 누르면 사전조사 답변을 바탕으로 인플루언서의 참여를 유도하는 매력적인 상단 안내글이 작성됩니다.</p>
              <p>• 배송지 주소(배송형), 방문 희망 일정(방문형)은 기본 포함되며, 피부 타입이나 옷 사이즈 등 원하는 <strong>커스텀 질문</strong>을 자유롭게 추가할 수 있습니다.</p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">3</span>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <span>지원자 관리 & 선정 (Applicants)</span>
                <span className="text-[11px] text-blue-400 font-normal">실시간 접수, 중복 감지, 선정/취소</span>
              </h3>
            </div>
            <div className="text-xs text-zinc-300 space-y-1.5 pl-8.5">
              <p>• <strong>중복 지원 자동 감지:</strong> 연락처나 SNS 계정이 겹치는 인플루언서는 <code>중복 N회</code> 배지가 노란색으로 자동 표시됩니다.</p>
              <p>• <strong>선정 / 예비선정 / 취소:</strong> <code>[최종선정]</code>, <code>[예비선정]</code> 버튼을 누를 수 있으며, 이미 선정된 인플루언서의 <strong><code>[선정 취소]</code>, <code>[예비 취소]</code></strong> 버튼을 누르면 언제든 대기 상태로 되돌릴 수 있습니다.</p>
              <p>• <code>[지원자 심사 공유 링크 복사]</code>를 광고주에게 전달하면 광고주도 로그인 없이 실시간 지원자 명단을 열람할 수 있습니다.</p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">4</span>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <span>시딩 관리시트 (Seeding Sheet)</span>
                <span className="text-[11px] text-blue-400 font-normal">송장/방문 단계 추적 & KST D-Day</span>
              </h3>
            </div>
            <div className="text-xs text-zinc-300 space-y-1.5 pl-8.5">
              <p>• 3단계에서 <code>최종선정</code>된 인플루언서가 이곳에 자동으로 동기화됩니다.</p>
              <p>• <strong>7단계 상태 추적:</strong> 선정완료 → 발송완료(송장번호) → 가이드전달 → 수령/방문 → 업로드완료(링크/조회수 입력)</p>
              <p>• <strong>KST D-Day 마감 알림:</strong> 업로드 마감일에 따라 <code>D-3</code>, <code>D-Day</code>, <code>지연 N일</code> 배지가 색상별로 자동 표시됩니다.</p>
              <p>• <code>[시딩 관리시트 공유 링크]</code>로 광고주에게 실시간 진행 현황을 공유하거나 CSV로 다운로드할 수 있습니다.</p>
            </div>
          </div>

          {/* Step 5 */}
          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">5</span>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <span>결과보고서 (Reports)</span>
                <span className="text-[11px] text-blue-400 font-normal">한글 PDF 및 편집 가능한 PPTX 다운로드</span>
              </h3>
            </div>
            <div className="text-xs text-zinc-300 space-y-1.5 pl-8.5">
              <p>• 총 지원자수, 최종선정률, 업로드 완료수, 누적 조회수 및 인게이지먼트를 1초 만에 자동 집계합니다.</p>
              <p>• <strong>한글 PDF 인쇄/다운로드</strong> 및 마케터가 폰트/도형을 자유롭게 수정할 수 있는 <strong>편집 가능한 파워포인트(.pptx) 파일</strong>을 즉시 생성하여 다운로드합니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Event Management */}
      <section id="events" className="space-y-6 pt-6 border-t border-[#22242A]">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-indigo-400">
            <PartyPopper className="w-4 h-4" />
            <span>서브프로젝트 B</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100">2. 인플루언서 행사 완벽 가이드</h2>
          <p className="text-xs text-zinc-400">
            브랜드 VIP 런칭 파티, 팝업스토어 초청, 현장 참석 체크인, PPT 행사 운영안 및 체크리스트를 관리합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
              <Users className="w-4 h-4" />
              <span>1. 초청 명단 & 현장 체크인</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              <strong>[시딩 지원자 불러오기]</strong> 버튼으로 기존 시딩 참여 인플루언서를 1초 만에 초청 목록에 추가할 수 있습니다. 
              참석 확정(RSVP) 및 현장 입장 시 <strong>[참석 체크인]</strong>을 원클릭으로 토글합니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
              <Presentation className="w-4 h-4" />
              <span>2. AI 운영안 & PPTX 생성</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              <strong>[Gemini AI 초안 자동완성]</strong>을 누르면 개요와 시간대별 세션 타임테이블이 작성됩니다. 
              <strong>[운영안 저장]</strong> 후 <strong>[운영안 PPT 다운로드]</strong>를 누르면 3장의 와이드 다크테마 PPTX가 출력됩니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
              <CheckSquare className="w-4 h-4" />
              <span>3. 준비 체크리스트 & D-Day</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              케이터링 발주, 음향 리허설 등 담당자와 마감일을 지정하여 누락 없이 관리하며, 
              마감일이 다가오면 홈 대시보드의 긴급 알림 및 캘린더에 자동 표시됩니다.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 3: SNS Operation */}
      <section id="sns" className="space-y-6 pt-6 border-t border-[#22242A]">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-sky-400">
            <Camera className="w-4 h-4" />
            <span>서브프로젝트 C</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100">3. SNS 공식 채널 대행 운영 완벽 가이드</h2>
          <p className="text-xs text-zinc-400">
            인스타그램, 유튜브, 틱톡 등 브랜드 공식 채널의 기획부터 클라이언트 승인, 성과 분석까지 원스톱으로 처리합니다.
          </p>
        </div>

        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] space-y-2.5">
            <h3 className="text-sm font-bold text-zinc-100">📌 핵심 운영 프로세스</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-zinc-300 pt-1">
              <div className="p-3 rounded-xl bg-[#090A0C] border border-[#22242A] space-y-1">
                <span className="font-bold text-sky-400 block">1. 클라이언트 사전설문 (Intake)</span>
                <span>계정 등록 후 발급된 <code>[광고주 사전설문 링크]</code>를 전송하면, 브랜드 톤앤매너와 금기 키워드를 무인증 폼으로 수신합니다.</span>
              </div>
              <div className="p-3 rounded-xl bg-[#090A0C] border border-[#22242A] space-y-1">
                <span className="font-bold text-sky-400 block">2. 콘텐츠 캘린더 & AI 카피라이팅</span>
                <span>월별 캘린더에서 날짜를 누르고 <strong>[Gemini AI 캡션 생성]</strong>을 누르면 자연스러운 이모지와 해시태그가 자동 작성됩니다.</span>
              </div>
              <div className="p-3 rounded-xl bg-[#090A0C] border border-[#22242A] space-y-1">
                <span className="font-bold text-sky-400 block">3. 클라이언트 컨펌 승인 링크</span>
                <span><code>[광고주 컨펌 전용 링크]</code>를 전송하면 광고주가 미리보기를 보고 원클릭 [최종 승인] 또는 [수정 요청] 피드백을 남깁니다.</span>
              </div>
              <div className="p-3 rounded-xl bg-[#090A0C] border border-[#22242A] space-y-1">
                <span className="font-bold text-sky-400 block">4. 월간 KPI 성과 분석</span>
                <span>발행 완료된 게시물의 조회수/좋아요/댓글을 입력하면 월간 총 도달수와 평균 참여율이 실시간 차트 카드로 집계됩니다.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: Overview Calendar */}
      <section id="overview" className="space-y-6 pt-6 border-t border-[#22242A]">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-400">
            <Calendar className="w-4 h-4" />
            <span>서브프로젝트 D</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100">4. 통합 대시보드 & 캘린더 활용법</h2>
          <p className="text-xs text-zinc-400">
            마케팅 대행사의 모든 프로젝트 일정을 한눈에 파악하고 지연을 사전에 방지합니다.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>상단 긴급 알림 (D-3 ~ 지연)</span>
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              오늘을 기준으로 <strong>마감 3일 전(D-3)부터 지연(D+) 상태인 항목</strong>만 상단에 긴급 배너로 모아서 보여줍니다. 
              시딩 리뷰 업로드 마감, 행사 당일 일정, 행사 준비 체크리스트 마감, SNS 발행 예정일이 모두 취합됩니다.
            </p>
          </div>

          <div className="space-y-2 pt-3 border-t border-[#22242A]">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>하단 월간 7열 캘린더</span>
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              <code>?month=YYYY-MM</code> 단위로 자유롭게 월을 이동하며, 색상 배지로 구분된 모든 마케팅 이벤트를 날짜별로 시각적으로 확인할 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 5: Settings */}
      <section className="space-y-6 pt-6 border-t border-[#22242A]">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400">
            <Settings className="w-4 h-4" />
            <span>환경설정 관리</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100">5. 환경설정 및 템플릿 커스텀</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/settings/pre-survey"
            className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-blue-500/40 transition space-y-2 group"
          >
            <div className="text-xs font-bold text-blue-400 group-hover:underline">사전조사 기본 템플릿 →</div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              신규 시딩 캠페인 생성 시 모든 광고주에게 공통으로 제시될 기본 질문 문항과 플레이스홀더를 관리합니다.
            </p>
          </Link>

          <Link
            href="/settings/sns-intake"
            className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-sky-500/40 transition space-y-2 group"
          >
            <div className="text-xs font-bold text-sky-400 group-hover:underline">SNS 사전설문 기본틀 →</div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              SNS 대행 계정의 광고주 인테이크 설문에 공통 적용되는 기본 질문 항목을 수정합니다.
            </p>
          </Link>

          <Link
            href="/settings/ppt-templates"
            className="p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-amber-500/40 transition space-y-2 group"
          >
            <div className="text-xs font-bold text-amber-400 group-hover:underline">공유 PPT 템플릿 관리 →</div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              행사 운영안 및 SNS 제안서에 적용할 .pptx 템플릿 파일을 업로드하고 플레이스홀더를 관리합니다.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}