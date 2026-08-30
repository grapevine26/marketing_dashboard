"use client";

import {
  Calendar,
  FolderKanban,
  PartyPopper,
  Camera,
  ArrowRight,
  Clock,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

export default function Theme3VelvetViolet() {
  return (
    <div className="bg-[#0F0E17] text-neutral-100 p-6 sm:p-8 rounded-3xl border border-[#28253B] space-y-6 font-sans shadow-2xl">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#201C35] via-[#161426] to-[#2B1633] border border-[#383354] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold">
            <Sparkles className="w-3 h-3" />
            <span>Velvet Charcoal & Violet Rose Theme</span>
          </div>
          <h2 className="text-xl font-bold text-neutral-100">통합 마케팅 오버뷰 & 전체 일정</h2>
          <p className="text-xs text-neutral-400">
            Arc / Figma Dark 스타일: 은은한 바이올렛과 로즈 포인트로 감각적이고 고급스럽습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition">
            + 새 시딩
          </button>
          <button className="px-3.5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold transition">
            + 새 행사
          </button>
        </div>
      </div>

      {/* 3-Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#191726] border border-[#28253B] hover:border-violet-500/40 transition space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center">
              <FolderKanban className="w-4 h-4" />
            </div>
            <span className="text-xs text-violet-400 font-semibold">관리 →</span>
          </div>
          <div>
            <span className="text-xs text-neutral-400">A. 인플루언서 시딩</span>
            <div className="text-2xl font-bold text-neutral-100 mt-0.5">8개 캠페인</div>
          </div>
          <p className="text-[11px] text-neutral-500">사전조사, 신청폼, 시딩시트, 결과보고서</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#191726] border border-[#28253B] hover:border-pink-500/40 transition space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center">
              <PartyPopper className="w-4 h-4" />
            </div>
            <span className="text-xs text-pink-400 font-semibold">관리 →</span>
          </div>
          <div>
            <span className="text-xs text-neutral-400">B. 오프라인 행사</span>
            <div className="text-2xl font-bold text-neutral-100 mt-0.5">3개 행사 등록</div>
          </div>
          <p className="text-[11px] text-neutral-500">모바일 RSVP, 명단 관리, 현장 체크인</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#191726] border border-[#28253B] hover:border-purple-500/40 transition space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <span className="text-xs text-purple-400 font-semibold">관리 →</span>
          </div>
          <div>
            <span className="text-xs text-neutral-400">C. SNS 채널 운영</span>
            <div className="text-2xl font-bold text-neutral-100 mt-0.5">12개 기획안</div>
          </div>
          <p className="text-[11px] text-neutral-500">AI 캡션 작성, 캘린더, 광고주 컨펌</p>
        </div>
      </div>

      {/* Calendar Timeline Widget */}
      <div className="p-6 rounded-2xl bg-[#191726] border border-[#28253B] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-bold text-neutral-200">통합 마케팅 일정</h3>
          </div>
          <div className="flex gap-1 bg-[#0F0E17] p-1 rounded-xl border border-[#28253B] text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-violet-600 text-white font-semibold">전체</span>
            <span className="px-2.5 py-1 text-neutral-400">시딩 마감</span>
            <span className="px-2.5 py-1 text-neutral-400">행사</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="p-3.5 rounded-xl bg-[#0F0E17] border border-[#28253B] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
                <FolderKanban className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-neutral-200">[시딩 마감] 이지은 (글로우랩 코스메틱)</div>
                <div className="text-[11px] text-neutral-400">하이드라 세럼 시딩 • 수령완료</div>
              </div>
            </div>
            <span className="font-mono text-xs text-violet-400 font-semibold">2026-09-10 (D-3)</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F0E17] border border-[#28253B] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-400 flex items-center justify-center">
                <PartyPopper className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-neutral-200">[오프라인 행사] 성수 VIP 런칭 파티</div>
                <div className="text-[11px] text-neutral-400">보테가 성수 2F • 참석 28/30명 확정</div>
              </div>
            </div>
            <span className="font-mono text-xs text-pink-400 font-semibold">2026-09-15 18:00</span>
          </div>
        </div>
      </div>
    </div>
  );
}