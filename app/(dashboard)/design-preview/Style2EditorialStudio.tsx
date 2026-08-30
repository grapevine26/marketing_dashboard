"use client";

import { Sparkles, ArrowRight, Bookmark, Heart, MessageCircle, Calendar, Layers } from "lucide-react";

export default function Style2EditorialStudio() {
  return (
    <div className="bg-[#FAF8F5] text-[#2C2825] p-8 rounded-3xl border border-[#E8E2D9] space-y-8 font-sans shadow-sm">
      {/* Editorial Magazine Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E8E2D9]">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest font-semibold text-[#8C827A] flex items-center gap-1.5">
            <span>Volume 04</span>
            <span>•</span>
            <span>Agency Intelligence</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-[#1A1816]">
            Marketing Studio & Editorial
          </h1>
          <p className="text-sm text-[#706760] font-light max-w-lg">
            브랜드의 정체성을 감각적으로 전달하는 인플루언서 크리에이티브 및 콘텐츠 아카이브.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full bg-[#EAE4DC] text-xs font-serif text-[#4A433D]">
            Issue No. 89 — Autumn 2026
          </span>
        </div>
      </div>

      {/* Large Minimalist Stat Row */}
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-[#8C827A] font-medium">01 / Curated Influencers</div>
          <div className="text-4xl font-serif text-[#1A1816]">148<span className="text-lg font-sans font-light text-[#8C827A]"> creators</span></div>
          <p className="text-xs text-[#706760] pt-1">엄선된 뷰티 & 라이프스타일 앰버서더</p>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-[#8C827A] font-medium">02 / Total Reach</div>
          <div className="text-4xl font-serif text-[#1A1816]">1.2M<span className="text-lg font-sans font-light text-[#8C827A]"> views</span></div>
          <p className="text-xs text-[#706760] pt-1">오가닉 바이럴 인게이지먼트 달성률 130%</p>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-[#8C827A] font-medium">03 / Exhibition & Party</div>
          <div className="text-4xl font-serif text-[#1A1816]">03<span className="text-lg font-sans font-light text-[#8C827A]"> events</span></div>
          <p className="text-xs text-[#706760] pt-1">성수 플래그십 VIP 프라이빗 세션</p>
        </div>
      </div>

      {/* Editorial Storyboard Cards */}
      <div className="grid grid-cols-2 gap-6 pt-2">
        {/* Card 1 */}
        <div className="p-6 rounded-2xl bg-white border border-[#EAE4DC] shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#8C827A]">
              <span className="font-serif italic">Seeding Feature</span>
              <span>Sep 02, 2026</span>
            </div>
            <h3 className="text-xl font-serif text-[#1A1816] leading-snug">
              글로우랩 하이드라 세럼 : 3초 속건조 수분 아카이브
            </h3>
            <p className="text-xs text-[#706760] leading-relaxed line-clamp-3">
              성분 분석 중심의 꼼꼼한 리뷰와 감각적인 텍스처 롤링 컷을 결합하여, 2030 직장인 타겟의 높은 공감대를 이끌어낸 시딩 캠페인.
            </p>
          </div>
          <div className="pt-4 border-t border-[#F2EDE6] flex items-center justify-between text-xs">
            <span className="text-[#8C827A]">참여 24명 • 업로드율 96%</span>
            <span className="font-serif italic font-medium text-[#1A1816] flex items-center gap-1">
              리포트 확인 <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="p-6 rounded-2xl bg-white border border-[#EAE4DC] shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#8C827A]">
              <span className="font-serif italic">Event & RSVP</span>
              <span>Sep 15, 2026</span>
            </div>
            <h3 className="text-xl font-serif text-[#1A1816] leading-snug">
              성수 보테가 런칭 VIP 프라이빗 파티
            </h3>
            <p className="text-xs text-[#706760] leading-relaxed line-clamp-3">
              클린 화이트 & 블루 드레스코드. 30명의 최상위 뷰티 크리에이터를 초청하여 현장 릴스 제작과 라이브 언팩을 진행하는 익스클루시브 나잇.
            </p>
          </div>
          <div className="pt-4 border-t border-[#F2EDE6] flex items-center justify-between text-xs">
            <span className="text-[#8C827A]">RSVP 28명 확정 • 정원 30명</span>
            <span className="font-serif italic font-medium text-[#1A1816] flex items-center gap-1">
              초대장 관리 <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}