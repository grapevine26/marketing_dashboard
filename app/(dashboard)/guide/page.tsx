import Link from "next/link";
import {
  BookOpen,
  FolderKanban,
  PartyPopper,
  Camera,
  Calendar,
  Settings,
  Share2,
  Users,
  Presentation,
  CheckSquare,
  Clock,
  HelpCircle,
  Zap,
  AlertTriangle,
  Sparkles,
  KeyRound,
} from "lucide-react";
import { SHIPPING_STAGES, VISIT_STAGES } from "@/lib/seeding/stages";

export const revalidate = 0;

/** 공유 링크 한눈에 보기 표 데이터 */
const SHARE_LINKS = [
  {
    group: "시딩 캠페인",
    name: "1. 광고주 사전조사 회신 링크",
    to: "광고주",
    can: "브랜드·제품 정보를 답변. [AI 추천받기]로 초안 작성 가능",
    hidden: "다른 링크의 주소, 지원자 정보",
  },
  {
    group: "시딩 캠페인",
    name: "2. 인플루언서 지원 신청폼 링크",
    to: "인플루언서 (공개 배포)",
    can: "모집 소개글을 읽고 지원서 제출",
    hidden: "지원자 목록, 선정 결과, 내부 정보 전부",
  },
  {
    group: "시딩 캠페인",
    name: "3. 광고주 지원자 선정 공유 링크",
    to: "광고주",
    can: "지원자 목록 열람 + 최종선정·예비선정·미선정 직접 처리",
    hidden: "연락처, 배송지, 방문 일정, 에이전시 메모",
  },
  {
    group: "시딩 캠페인",
    name: "4. 광고주 시딩 관리시트 공유 링크",
    to: "광고주",
    can: "진행 단계·업로드 링크·조회수 열람 (조회 전용)",
    hidden: "연락처, 배송지, 에이전시 메모",
  },
  {
    group: "SNS 운영",
    name: "1. 광고주 자료요청 / 사전설문 링크",
    to: "광고주",
    can: "톤앤매너·금기 키워드 답변. [AI 추천 답변] 사용 가능",
    hidden: "콘텐츠 목록, 성과 수치",
  },
  {
    group: "SNS 운영",
    name: "2. 광고주 시안 승인(컨펌) 링크",
    to: "광고주",
    can: "승인대기 시안만 확인하고 [승인] 또는 [수정 요청]",
    hidden: "제작 메모, 성과 수치, 승인대기가 아닌 콘텐츠",
  },
];

/** 화면에 실제로 쓰이는 단계 정의를 그대로 가져온다. 코드가 바뀌면 가이드도 같이 바뀐다. */
const SEEDING_STAGES = [
  { type: "배송형", stages: SHIPPING_STAGES },
  { type: "방문형", stages: VISIT_STAGES },
];

const TROUBLE = [
  {
    q: "PPT 다운로드를 눌렀는데 에러가 납니다.",
    a: "운영안·제안서 PPT는 적용할 템플릿을 고르고 [운영안 저장]을 누른 뒤에만 받을 수 있습니다. 저장 전이면 저장된 운영안이 없다는 안내가, 템플릿이 없으면 템플릿 안내가 뜹니다. 템플릿은 설정의 공유 PPT 템플릿 보관함에서 종류를 골라 업로드합니다.",
  },
  {
    q: "AI 버튼을 눌렀더니 AI 제안 실패라고 나옵니다.",
    a: "Gemini API 키가 설정돼 있지 않거나 일시적으로 응답하지 않은 경우입니다. 서버의 GEMINI_API_KEY 환경변수를 확인하세요. 키가 없어도 나머지 기능은 모두 정상 동작하며, 해당 칸은 직접 입력하면 됩니다.",
  },
  {
    q: "지원폼을 테스트하는데 갑자기 제출이 막힙니다.",
    a: "스팸 방지를 위해 같은 접속 위치에서 10분에 5회까지만 접수됩니다. 10분 뒤에 자동으로 풀립니다. 고장이 아닙니다.",
  },
  {
    q: "시안 이미지·영상 첨부가 실패합니다.",
    a: "파일 하나당 50MB까지, JPG·PNG·WebP·GIF·MP4·WebM·MOV만 올릴 수 있습니다. 확장자만 바꾼 파일은 내용 검사에서 거부됩니다.",
  },
  {
    q: "공유 링크를 잘못된 사람에게 보냈습니다.",
    a: "해당 링크 카드의 [재발급]을 누르면 새 주소가 발급되고 이전 링크는 즉시 차단됩니다. 이미 전달한 사람에게는 새 링크를 다시 보내야 합니다.",
  },
  {
    q: "행사를 만들려는데 개설이 안 됩니다.",
    a: "행사는 반드시 캠페인에 연결됩니다. 먼저 인플루언서 시딩에서 캠페인을 하나 만든 뒤 행사를 개설하세요.",
  },
  {
    q: "관리시트에 인플루언서가 안 보입니다.",
    a: "관리시트에는 최종선정된 지원자만 자동으로 들어옵니다. 예비선정이나 지원완료 상태는 표시되지 않습니다.",
  },
  {
    q: "결과보고서에 최신 성과가 반영되지 않습니다.",
    a: "보고서는 만든 시점의 스냅샷을 보존합니다. 최신 수치가 필요하면 목록에서 새 결과보고서를 다시 생성하세요.",
  },
];

export default function GuidePage() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 font-sans pb-16">
      {/* Hero */}
      <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-surface via-surface2 to-sidebar border border-border space-y-4 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold">
          <BookOpen className="w-3.5 h-3.5" />
          <span>마케팅 올인원 사용 매뉴얼</span>
        </div>

        <h1 className="text-2xl sm:text-4xl font-extrabold text-text tracking-tight leading-tight">
          처음 오셨나요? <br />
          <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
            마케팅 올인원 대시보드 사용 가이드
          </span>
        </h1>

        <p className="text-xs sm:text-sm text-text-2 leading-relaxed max-w-3xl">
          인플루언서 시딩 체험단, 인플루언서 초청 행사, SNS 공식 채널 대행 운영을 한 화면에서 관리합니다. 광고주와
          인플루언서에게는 로그인 없이 열리는 전용 링크를 보내고, 결과물은 PDF와 파워포인트로 내려받습니다. Gemini AI는
          초안 작성을 돕는 보조 기능입니다.
        </p>

        <div className="pt-2 flex flex-wrap gap-2.5">
          <a href="#before" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md">
            시작하기 전에
          </a>
          <a href="#links" className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-text text-xs font-semibold transition">
            공유 링크 한눈에 보기
          </a>
          <a href="#seeding" className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-text text-xs font-semibold transition">
            1. 인플루언서 시딩
          </a>
          <a href="#events" className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-text text-xs font-semibold transition">
            2. 인플루언서 행사
          </a>
          <a href="#sns" className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-text text-xs font-semibold transition">
            3. SNS 채널 운영
          </a>
          <a href="#overview" className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-text text-xs font-semibold transition">
            4. 통합 오버뷰
          </a>
          <a href="#settings" className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-text text-xs font-semibold transition">
            5. 설정과 템플릿
          </a>
          <a href="#trouble" className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-text text-xs font-semibold transition">
            자주 막히는 곳
          </a>
        </div>
      </div>

      {/* 시작하기 전에 */}
      <section id="before" className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-bold text-text">시작하기 전에 꼭 알아둘 4가지</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-surface border border-amber-500/25 space-y-2">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>로그인이 없습니다</span>
            </h3>
            <p className="text-xs text-text-2 leading-relaxed">
              대시보드와 공유 링크 모두 비밀번호가 없습니다. 주소를 아는 사람은 누구나 들어옵니다. 공유 링크는 필요한
              사람에게만 보내고, 담당자가 바뀌거나 잘못 전달했다면 그 링크의 <strong>[재발급]</strong>을 눌러 이전 주소를
              차단하세요.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-blue-400" />
              <span>캠페인이 모든 것의 출발점입니다</span>
            </h3>
            <p className="text-xs text-text-2 leading-relaxed">
              행사는 캠페인에 연결되어야만 개설됩니다. 초청 행사만 진행하더라도 <strong>[인플루언서 시딩] → [새 캠페인 등록]</strong>
              으로 캠페인을 먼저 만들어야 합니다. SNS 채널 운영은 캠페인 없이 단독으로 쓸 수 있습니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span>AI는 보조 기능이고 키가 필요합니다</span>
            </h3>
            <p className="text-xs text-text-2 leading-relaxed">
              AI 버튼은 서버에 <code className="px-1 rounded bg-bg border border-border">GEMINI_API_KEY</code>가 설정돼 있을 때만
              동작합니다. 키가 없으면 AI 제안 실패 안내가 뜨고, 기존에 쓰던 내용은 지워지지 않습니다. AI 없이도 모든 기능을
              손으로 쓸 수 있습니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>공개 폼에는 접수 제한이 있습니다</span>
            </h3>
            <p className="text-xs text-text-2 leading-relaxed">
              지원폼과 공개 설문은 같은 접속 위치에서 <strong>10분에 5회</strong>까지만 제출됩니다. 담당자가 테스트하다 막힐 수
              있는데 고장이 아니라 스팸 방지 장치이며 10분 뒤 자동으로 풀립니다.
            </p>
          </div>
        </div>
      </section>

      {/* 공유 링크 표 */}
      <section id="links" className="space-y-4 pt-6 border-t border-border">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-sky-400">
            <Share2 className="w-4 h-4" />
            <span>가장 많이 쓰는 기능</span>
          </div>
          <h2 className="text-xl font-bold text-text">공유 링크 한눈에 보기</h2>
          <p className="text-xs text-text-sub">
            캠페인 허브와 SNS 계정 화면 상단에서 [링크 복사]로 가져다 씁니다. 링크마다 상대가 할 수 있는 일과 가려지는 정보가
            다릅니다.
          </p>
        </div>

        <div className="rounded-2xl bg-surface border border-border overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead className="bg-surface2 text-text-sub text-[11px] uppercase tracking-wider">
              <tr>
                <th className="p-3.5 font-semibold">링크</th>
                <th className="p-3.5 font-semibold">받는 사람</th>
                <th className="p-3.5 font-semibold">할 수 있는 일</th>
                <th className="p-3.5 font-semibold">보이지 않는 정보</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {SHARE_LINKS.map((l) => (
                <tr key={l.group + l.name}>
                  <td className="p-3.5 align-top">
                    <span className="block text-[10px] font-bold text-text-muted">{l.group}</span>
                    <span className="font-semibold text-text">{l.name}</span>
                  </td>
                  <td className="p-3.5 align-top text-text-2 whitespace-nowrap">{l.to}</td>
                  <td className="p-3.5 align-top text-text-2">{l.can}</td>
                  <td className="p-3.5 align-top text-text-sub">{l.hidden}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-text-muted leading-relaxed">
          링크 카드의 <strong>[재발급]</strong>은 새 주소를 만들고 이전 주소를 즉시 차단합니다. 되돌릴 수 없으므로 확인 창이 한
          번 뜨고, 재발급 기록은 캠페인 허브 하단의 활동 기록에 남습니다.
        </p>
      </section>

      {/* Quick Start */}
      <section id="quick-start" className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-bold text-text">빠른 시작</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-extrabold text-sm">1</div>
            <h3 className="text-sm font-bold text-text">체험단 시딩을 할 때</h3>
            <p className="text-xs text-text-sub leading-relaxed">
              [인플루언서 시딩] → [새 캠페인 등록]으로 캠페인을 만들고, 허브 상단에서 사전조사 링크는 광고주에게, 신청폼
              링크는 인플루언서에게 보냅니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-extrabold text-sm">2</div>
            <h3 className="text-sm font-bold text-text">행사·팝업 초청을 할 때</h3>
            <p className="text-xs text-text-sub leading-relaxed">
              캠페인을 먼저 만든 뒤 [인플루언서 행사] → [새 행사 개설]에서 그 캠페인을 고릅니다. 초청 명단은 캠페인 지원자에서
              그대로 가져올 수 있습니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center font-extrabold text-sm">3</div>
            <h3 className="text-sm font-bold text-text">SNS 채널을 대행할 때</h3>
            <p className="text-xs text-text-sub leading-relaxed">
              [SNS 채널 운영]에서 계정을 등록하면 사전설문 링크와 시안 승인 링크가 바로 발급됩니다. 캠페인 없이 단독으로 쓸 수
              있습니다.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 1: 시딩 */}
      <section id="seeding" className="space-y-6 pt-6 border-t border-border">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-400">
            <FolderKanban className="w-4 h-4" />
            <span>서브프로젝트 A</span>
          </div>
          <h2 className="text-xl font-bold text-text">1. 인플루언서 시딩 5단계</h2>
          <p className="text-xs text-text-sub">
            캠페인 허브에 5개 카드가 순서대로 놓여 있습니다. 앞 단계를 끝내야 다음 단계에 내용이 채워집니다.
          </p>
        </div>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">1</span>
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <span>사전조사</span>
                <span className="text-[11px] text-blue-400 font-normal">광고주에게 브랜드 정보를 받는다</span>
              </h3>
            </div>
            <div className="text-xs text-text-2 space-y-1.5 pl-8.5 leading-relaxed">
              <p>• 캠페인 허브 상단 <strong>1. 광고주 사전조사 회신 링크</strong>의 [링크 복사]를 눌러 광고주에게 보냅니다.</p>
              <p>• 광고주는 로그인 없이 답변하며, 각 질문의 <strong>[AI 추천받기]</strong>로 초안을 받아 고쳐 쓸 수 있습니다.</p>
              <p>• 회신된 답변은 <strong>[사전조사 관리]</strong> 카드에서 확인하고 직접 수정할 수도 있습니다. 답변이 오면 카드에 회신완료 배지가 붙습니다.</p>
              <p>• 공통 질문 문항은 <strong>[설정 → 사전조사 기본 템플릿]</strong>에서 미리 정해 둡니다.</p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">2</span>
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <span>신청폼 설정</span>
                <span className="text-[11px] text-blue-400 font-normal">인플루언서에게 뿌릴 모집폼을 만든다</span>
              </h3>
            </div>
            <div className="text-xs text-text-2 space-y-1.5 pl-8.5 leading-relaxed">
              <p>• <strong>[신청폼 에디터]</strong>에서 모집 소개글을 씁니다. <strong>[Gemini AI 모집글 초안 생성]</strong>은 사전조사 답변을 참고해 초안을 만들어 줍니다.</p>
              <p>• 배송형은 배송지 주소, 방문형은 방문 희망 일정과 인원이 기본으로 들어갑니다. 피부 타입이나 옷 사이즈 같은 <strong>커스텀 질문</strong>은 주관식·숫자·선택·체크박스로 추가할 수 있습니다.</p>
              <p>• 모집을 닫으려면 에디터에서 <strong>접수 중단</strong>으로 바꿉니다. 허브 카드의 배지가 접수중에서 접수 중단으로 바뀌고, 공개 폼은 제출을 받지 않습니다.</p>
              <p>• <strong>[공개 신청폼 미리보기]</strong>로 인플루언서에게 보이는 화면을 그대로 확인하세요.</p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">3</span>
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <span>지원자 심사</span>
                <span className="text-[11px] text-blue-400 font-normal">접수 확인, 중복 감지, 선정</span>
              </h3>
            </div>
            <div className="text-xs text-text-2 space-y-1.5 pl-8.5 leading-relaxed">
              <p>• 이름·연락처·SNS·메모로 <strong>검색</strong>하고, 상태 탭으로 거르고, <strong>팔로워순</strong>으로 정렬합니다. 20명씩 나눠 표시됩니다.</p>
              <p>• 연락처나 SNS 계정이 겹치면 <strong>중복 의심</strong> 배지가 붙습니다. 연락처가 달라도 SNS 주소가 같으면 잡힙니다.</p>
              <p>• 이름을 누르면 지원서 전체 답변이 열립니다. <strong>에이전시 메모</strong>는 내부용이라 광고주 공유 페이지와 광고주용 파일에는 나가지 않습니다.</p>
              <p>• <strong>[안내문]</strong> 버튼을 누르면 선정 안내 문구에 이름과 채널이 채워진 상태로 복사됩니다. 자주 쓰는 문구는 캠페인 기본 템플릿으로 저장해 둘 수 있습니다.</p>
              <p>• 목록은 <strong>CSV</strong>와 <strong>엑셀(XLSX)</strong>로 내려받습니다.</p>
            </div>

            <div className="pl-8.5">
              <div className="rounded-xl bg-bg border border-border overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[420px]">
                  <thead className="text-text-muted text-[11px]">
                    <tr>
                      <th className="p-2.5 font-semibold">지금 상태</th>
                      <th className="p-2.5 font-semibold">보이는 버튼</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-text-2">
                    <tr>
                      <td className="p-2.5">지원완료</td>
                      <td className="p-2.5">최종선정 / 예비선정 / 미선정</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">최종선정</td>
                      <td className="p-2.5">선정 취소 / 예비로 변경</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">예비선정</td>
                      <td className="p-2.5">최종선정 승격 / 예비 취소</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-text-muted mt-1.5">
                선정을 취소해도 관리시트에 남긴 기록은 지워지지 않습니다. 광고주도 <strong>3. 광고주 지원자 선정 공유 링크</strong>에서 같은 선정 버튼을 쓸 수 있습니다.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">4</span>
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <span>시딩 관리시트</span>
                <span className="text-[11px] text-blue-400 font-normal">진행 단계와 마감 추적</span>
              </h3>
            </div>
            <div className="text-xs text-text-2 space-y-1.5 pl-8.5 leading-relaxed">
              <p>• <strong>최종선정된 지원자만</strong> 이 표에 들어옵니다. 예비선정은 최종선정으로 올려야 나타납니다.</p>
              <p>• 진행 단계는 캠페인 유형에 따라 다르게 표시됩니다.</p>
            </div>

            <div className="pl-8.5 space-y-2">
              {SEEDING_STAGES.map((row) => (
                <div key={row.type} className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-bold shrink-0">
                    {row.type}
                  </span>
                  {row.stages.map((s, i) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-lg bg-bg border border-border text-[11px] text-text-2">{s}</span>
                      {i < row.stages.length - 1 && <span className="text-text-faint text-[11px]">→</span>}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            <div className="text-xs text-text-2 space-y-1.5 pl-8.5 leading-relaxed">
              <p>• 입력칸은 <strong>포커스가 빠져나가면 자동 저장</strong>됩니다. 별도의 저장 버튼이 없습니다.</p>
              <p>• 업로드 마감일을 넣으면 한국 시간 기준으로 <strong>D-3, D-DAY, 지연</strong> 배지가 자동으로 붙고, 통합 오버뷰의 임박 목록에도 함께 올라옵니다.</p>
              <p>• <strong>4. 광고주 시딩 관리시트 공유 링크</strong>는 조회 전용이라 광고주가 값을 바꿀 수 없습니다. CSV·엑셀 내려받기도 지원합니다.</p>
            </div>
          </div>

          {/* Step 5 */}
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">5</span>
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <span>결과보고서</span>
                <span className="text-[11px] text-blue-400 font-normal">PDF와 편집 가능한 PPTX</span>
              </h3>
            </div>
            <div className="text-xs text-text-2 space-y-1.5 pl-8.5 leading-relaxed">
              <p>• <strong>[새 결과보고서 생성]</strong>을 누르면 그 시점의 지원자·관리시트·성과가 <strong>스냅샷으로 저장</strong>됩니다. 이후 수치가 바뀌어도 보고서는 그대로 보존되므로, 최신 내용이 필요하면 보고서를 새로 만드세요.</p>
              <p>• <strong>[총평 편집 &amp; 열기]</strong>에서 총평과 추가 섹션을 쓴 뒤 내려받습니다.</p>
              <p>• <strong>[PDF 보고서 다운로드]</strong>는 한글이 정상 출력되고 성과 막대 차트가 들어갑니다. <strong>[PPTX 슬라이드 다운로드]</strong>는 파워포인트에서 그대로 편집할 수 있고, 표와 차트도 파워포인트 개체로 들어갑니다.</p>
              <p>• PPTX는 적용할 템플릿을 고를 수 있습니다. 기본 템플릿이 이미 들어 있고, 회사 서식은 <strong>[설정 → 공유 PPT 템플릿 보관함]</strong>에 시딩 결과보고서 종류로 올리면 목록에 나타납니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: 행사 */}
      <section id="events" className="space-y-6 pt-6 border-t border-border">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-indigo-400">
            <PartyPopper className="w-4 h-4" />
            <span>서브프로젝트 B</span>
          </div>
          <h2 className="text-xl font-bold text-text">2. 인플루언서 행사</h2>
          <p className="text-xs text-text-sub">
            런칭 파티, 팝업스토어 초청 같은 오프라인 행사를 관리합니다. 행사는 캠페인에 연결해서 개설합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
              <Users className="w-4 h-4" />
              <span>1. 초청 명단과 현장 체크</span>
            </div>
            <p className="text-xs text-text-sub leading-relaxed">
              <strong>[캠페인 지원자에서 가져오기]</strong>로 그 캠페인 지원자를 골라 초청 명단에 넣습니다. 이름·SNS·연락처가 그
              시점 값으로 복사되고, 이미 넣은 사람은 이미 초청됨으로 표시됩니다. 명단에 없는 사람은
              <strong> [초대자 직접 추가]</strong>로 넣습니다. RSVP는 미응답·참석 확정·불참 중에서 고르고, 행사 당일에는
              <strong> 당일 현장 참석</strong> 칸을 체크합니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
              <Presentation className="w-4 h-4" />
              <span>2. 운영안과 PPT</span>
            </div>
            <p className="text-xs text-text-sub leading-relaxed">
              운영안 탭에서 <strong>적용할 PPT 템플릿을 먼저 고르면</strong> 그 템플릿의 치환 항목이 입력칸으로 펼쳐집니다.
              항목마다 <strong>[AI 초안]</strong>을 쓰거나 <strong>[빈 항목만 AI로 채우기]</strong>로 한 번에 채운 뒤
              <strong> [운영안 저장]</strong>을 누릅니다. 저장한 뒤에야 <strong>[운영안 PPT 다운로드]</strong>가 동작하며, 나오는
              슬라이드 구성은 고른 템플릿을 따릅니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
              <CheckSquare className="w-4 h-4" />
              <span>3. 준비 체크리스트</span>
            </div>
            <p className="text-xs text-text-sub leading-relaxed">
              케이터링 발주, 음향 리허설처럼 준비 항목을 담당자와 마감일과 함께 적어 둡니다. 마감일이 가까워지면 통합 오버뷰의
              임박 목록과 캘린더에 자동으로 올라옵니다. 행사 일시는 한국 시간으로 입력하고 화면에도 한국 시간으로 표시됩니다.
            </p>
          </div>
        </div>

        <p className="text-[11px] text-text-muted leading-relaxed">
          행사 상태는 준비중·완료·취소로 바꿀 수 있고, 기본 정보 수정과 삭제도 행사 상세 화면에서 합니다.
        </p>
      </section>

      {/* SECTION 3: SNS */}
      <section id="sns" className="space-y-6 pt-6 border-t border-border">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-sky-400">
            <Camera className="w-4 h-4" />
            <span>서브프로젝트 C</span>
          </div>
          <h2 className="text-xl font-bold text-text">3. SNS 공식 채널 대행 운영</h2>
          <p className="text-xs text-text-sub">
            인스타그램·유튜브·틱톡 등 브랜드 공식 채널을 기획부터 승인, 성과 정리까지 한 화면에서 처리합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
            <span className="font-bold text-sky-400 text-xs block">1. 계정 등록과 사전설문</span>
            <p className="text-xs text-text-2 leading-relaxed">
              계정을 등록하면 사전설문 링크와 시안 승인 링크가 함께 발급됩니다. 사전설문 링크를 광고주에게 보내 톤앤매너와 금기
              키워드를 받고, 회신은 계정 화면의 사전설문 응답 탭에서 질문 문구와 함께 확인합니다. 공통 질문은
              <strong> [설정 → SNS 사전설문 기본틀]</strong>에서 정합니다.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
            <span className="font-bold text-sky-400 text-xs block">2. 콘텐츠 캘린더와 시안</span>
            <p className="text-xs text-text-2 leading-relaxed">
              <strong>[새 콘텐츠 기획]</strong>으로 발행 예정일·담당자·캡션·해시태그를 적습니다. 캡션은
              <strong> [Gemini AI 문안 작성]</strong>으로 초안을 받을 수 있습니다. 이미지와 영상 시안은 파일당 50MB까지 첨부하며
              JPG·PNG·WebP·GIF·MP4·WebM·MOV를 지원합니다.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
            <span className="font-bold text-sky-400 text-xs block">3. 광고주 승인</span>
            <p className="text-xs text-text-2 leading-relaxed">
              콘텐츠를 승인대기로 올리고 시안 승인 링크를 보내면, 광고주는 첨부한 시안을 직접 보면서 <strong>[승인]</strong> 또는
              <strong> [수정 요청]</strong>을 누릅니다. 수정 요청에는 코멘트가 필수라 무엇을 고쳐야 하는지 남습니다. 코멘트는 대시보드에
              표시되고, 캡션을 고쳐 다시 승인대기로 올릴 수 있습니다.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
            <span className="font-bold text-sky-400 text-xs block">4. 성과 정리</span>
            <p className="text-xs text-text-2 leading-relaxed">
              게시완료로 바뀐 콘텐츠에만 조회수·좋아요·댓글을 넣을 수 있습니다. 집계는 게시완료로 바뀐 달을 기준으로 월별로
              묶이며, 월을 골라 보거나 전체 누적을 함께 봅니다.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
          <span className="font-bold text-sky-400 text-xs block">SNS 운영안 제안서</span>
          <p className="text-xs text-text-2 leading-relaxed">
            계정 화면의 <strong>[SNS 운영안 (웹/PPT)]</strong>에서 채널 운영 제안서를 만듭니다. 행사 운영안과 같은 방식으로 템플릿을
            고르고, 항목별 AI 초안이나 [빈 항목만 AI로 채우기]로 채운 뒤 저장하면 PPT로 내려받습니다. 템플릿 없이 웹 화면으로만
            정리해 두는 것도 가능합니다.
          </p>
        </div>

        <p className="text-[11px] text-text-muted leading-relaxed">
          계정 정보 수정, 운영중과 계약종료 상태 전환, 계정 삭제도 같은 화면에서 합니다. 계정을 삭제하면 콘텐츠·기획안·설문
          응답과 첨부한 시안 파일까지 함께 지워집니다.
        </p>
      </section>

      {/* SECTION 4: 오버뷰 */}
      <section id="overview" className="space-y-6 pt-6 border-t border-border">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-400">
            <Calendar className="w-4 h-4" />
            <span>서브프로젝트 D</span>
          </div>
          <h2 className="text-xl font-bold text-text">4. 통합 오버뷰와 캘린더</h2>
          <p className="text-xs text-text-sub">진행 중인 모든 일정을 한 화면에 모아 놓친 마감을 막습니다.</p>
        </div>

        <div className="p-6 rounded-3xl bg-surface border border-border space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>임박 및 지연 일정</span>
            </h3>
            <p className="text-xs text-text-2 leading-relaxed">
              오늘 기준으로 <strong>마감 3일 전부터 이미 지난 것까지</strong>만 상단에 모입니다. 시딩 업로드 마감, 행사 당일,
              행사 준비 체크리스트 마감, SNS 발행 예정일이 함께 올라오고 각 항목에서 해당 화면으로 바로 이동합니다.
            </p>
          </div>

          <div className="space-y-2 pt-3 border-t border-border">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>월간 캘린더</span>
            </h3>
            <p className="text-xs text-text-2 leading-relaxed">
              위쪽 화살표로 달을 옮기고 <strong>[오늘]</strong>로 되돌아옵니다. 날짜 칸을 누르면 그날 일정만 모아 보는 창이
              열립니다. 색상은 아래 범례로 구분하며 모든 날짜는 한국 시간 기준입니다. 삭제된 캠페인이나 계정에 딸린 일정은
              자동으로 빠집니다.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 5: 설정 */}
      <section id="settings" className="space-y-6 pt-6 border-t border-border">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-text-sub">
            <Settings className="w-4 h-4" />
            <span>환경설정</span>
          </div>
          <h2 className="text-xl font-bold text-text">5. 설정과 템플릿</h2>
          <p className="text-xs text-text-sub">여기서 정한 값은 앞으로 만드는 캠페인과 계정에 공통으로 적용됩니다.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/settings/pre-survey"
            className="p-5 rounded-2xl bg-surface border border-border hover:border-blue-500/40 transition space-y-2 group"
          >
            <div className="text-xs font-bold text-blue-400 group-hover:underline">사전조사 기본 템플릿 →</div>
            <p className="text-xs text-text-sub leading-relaxed">
              새 시딩 캠페인의 사전조사에 공통으로 나갈 질문과 예시 문구를 정합니다.
            </p>
          </Link>

          <Link
            href="/settings/sns-intake"
            className="p-5 rounded-2xl bg-surface border border-border hover:border-sky-500/40 transition space-y-2 group"
          >
            <div className="text-xs font-bold text-sky-400 group-hover:underline">SNS 사전설문 기본틀 →</div>
            <p className="text-xs text-text-sub leading-relaxed">
              SNS 계정의 광고주 사전설문에 공통으로 나갈 질문을 정합니다. 질문을 비워 두면 저장되지 않습니다.
            </p>
          </Link>

          <Link
            href="/settings/ppt-templates"
            className="p-5 rounded-2xl bg-surface border border-border hover:border-amber-500/40 transition space-y-2 group"
          >
            <div className="text-xs font-bold text-amber-400 group-hover:underline">공유 PPT 템플릿 보관함 →</div>
            <p className="text-xs text-text-sub leading-relaxed">
              회사 서식 .pptx를 올려 두면 운영안과 보고서를 그 서식으로 뽑습니다.
            </p>
          </Link>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-border space-y-2.5">
          <h3 className="text-sm font-bold text-text">PPT 템플릿은 종류를 맞춰 올려야 합니다</h3>
          <p className="text-xs text-text-2 leading-relaxed">
            템플릿을 올릴 때 고르는 종류에 따라 나타나는 화면이 다릅니다. <strong>인플루언서 행사 운영안</strong>은 행사 운영안
            탭에, <strong>SNS 채널 운영 제안서</strong>는 SNS 운영안 화면에, <strong>시딩 결과보고서</strong>는 보고서 상세의
            PPTX 다운로드 옆에 나옵니다. 종류를 잘못 고르면 필요한 화면에서 보이지 않습니다.
          </p>
          <p className="text-xs text-text-2 leading-relaxed">
            슬라이드에 <code className="px-1 rounded bg-bg border border-border">{"{{항목명}}"}</code> 형태로 적어 둔 자리가 입력칸이
            됩니다. 결과보고서 템플릿에서는 <code className="px-1 rounded bg-bg border border-border">{"{{표:인플루언서}}"}</code>와
            <code className="px-1 rounded bg-bg border border-border">{"{{차트:성과}}"}</code>를 넣은 도형 자리에 표와 차트가 들어갑니다.
            파일은 .pptx만, 15MB까지 올릴 수 있고 기본 제공 템플릿은 지워지지 않습니다.
          </p>
        </div>
      </section>

      {/* 알아두면 좋은 것 */}
      <section className="space-y-4 pt-6 border-t border-border">
        <h2 className="text-xl font-bold text-text">알아두면 좋은 기능</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
            <h3 className="text-sm font-bold text-text">마감 알림 웹훅</h3>
            <p className="text-xs text-text-2 leading-relaxed">
              캠페인 허브 아래쪽에서 슬랙이나 디스코드의 수신 웹훅 주소를 넣으면 마감 알림을 그 채널로 보냅니다.
              <strong> [테스트 발송]</strong>으로 먼저 확인하세요. 보안을 위해 슬랙과 디스코드 주소만 등록됩니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
            <h3 className="text-sm font-bold text-text">활동 기록</h3>
            <p className="text-xs text-text-2 leading-relaxed">
              선정 변경, 메모 수정, 관리시트 단계 변경, 시안 승인, 링크 재발급, 삭제가 캠페인 허브 하단에 시간순으로 남습니다.
              광고주가 공유 링크에서 처리한 것도 함께 기록됩니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
            <h3 className="text-sm font-bold text-text">캠페인 상태와 삭제</h3>
            <p className="text-xs text-text-2 leading-relaxed">
              캠페인 상태는 준비중·모집중·선정중·시딩 진행중·보고서 작성·종료로 바꿉니다. 목록에서 캠페인을 지우면 지원자,
              관리시트, 연결된 행사, 보고서가 함께 지워지므로 되돌릴 수 없습니다.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
            <h3 className="text-sm font-bold text-text">화면 테마와 데이터 백업</h3>
            <p className="text-xs text-text-2 leading-relaxed">
              왼쪽 아래에서 다크와 화이트를 고를 수 있고 다음에 열 때도 유지됩니다. 데이터는 저장할 때마다 일정 간격으로
              백업본이 쌓이며, 문제가 생기면 서버에서 복원 명령으로 되돌립니다.
            </p>
          </div>
        </div>
      </section>

      {/* 자주 막히는 곳 */}
      <section id="trouble" className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-rose-400" />
          <h2 className="text-xl font-bold text-text">자주 막히는 곳</h2>
        </div>

        <div className="space-y-3">
          {TROUBLE.map((t) => (
            <div key={t.q} className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
              <h3 className="text-xs font-bold text-text">{t.q}</h3>
              <p className="text-xs text-text-2 leading-relaxed">{t.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
