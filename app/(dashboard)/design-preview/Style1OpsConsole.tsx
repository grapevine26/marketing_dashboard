"use client";

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  Clock,
  ArrowUpRight,
  Filter,
  Search,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Truck,
  Sparkles,
  ChevronRight,
  Eye,
  Heart,
  Share2,
} from "lucide-react";

export default function StyleAEnterpriseLight() {
  const [filterTab, setFilterTab] = useState("all");

  return (
    <div className="bg-slate-50 text-slate-900 p-8 rounded-3xl border border-slate-200/80 space-y-6 shadow-sm font-sans">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">마케팅 총괄 퍼포먼스</h2>
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
              실시간 동기화
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            2026년 3분기 인플루언서 시딩, 오프라인 행사, SNS 채널 운영 통합 지표
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-white rounded-xl border border-slate-200 p-1 text-xs font-medium text-slate-600 shadow-sm">
            <button className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold shadow-xs">
              이번 달
            </button>
            <button className="px-3 py-1.5 rounded-lg hover:text-slate-900 transition">
              지난 달
            </button>
            <button className="px-3 py-1.5 rounded-lg hover:text-slate-900 transition">
              전체 분기
            </button>
          </div>
        </div>
      </div>

      {/* 4-Column High-Impact KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>총 인플루언서 지원자</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-extrabold text-slate-900">1,248명</div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+18.4%</span>
              <span className="text-slate-400 font-normal">전월 대비</span>
            </div>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>콘텐츠 업로드 완료율</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-extrabold text-slate-900">92.5%</div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <span>148건 중 137건 완료</span>
            </div>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>누적 총 도달수 (Views)</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Eye className="w-4 h-4" />
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-extrabold text-slate-900">3.82M</div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+34.2%</span>
              <span className="text-slate-400 font-normal">목표 초과 달성</span>
            </div>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>행사 참석률 (RSVP)</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Calendar className="w-4 h-4" />
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-extrabold text-slate-900">93.3%</div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>정원 30명 중 28명 확정</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Pipeline Table + Urgent Action Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Pipeline Management Table */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900">진행 중인 마케팅 캠페인 파이프라인</h3>
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <input
                  type="text"
                  placeholder="캠페인/광고주 검색..."
                  className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">캠페인명</th>
                  <th className="p-3">유형</th>
                  <th className="p-3">진행 단계</th>
                  <th className="p-3">선정/정원</th>
                  <th className="p-3">업로드 마감</th>
                  <th className="p-3">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr className="hover:bg-slate-50/60 transition">
                  <td className="p-3 font-semibold text-slate-900">
                    글로우랩 하이드라 세럼
                    <span className="block text-[11px] text-slate-400 font-normal">글로우랩 코스메틱</span>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium text-[11px]">배송형</span>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      가이드전달완료
                    </span>
                  </td>
                  <td className="p-3 font-medium">24 / 25명</td>
                  <td className="p-3 font-mono text-slate-600">D-3 (09/10)</td>
                  <td className="p-3">
                    <button className="text-blue-600 hover:text-blue-800 font-semibold text-[11px]">관리 →</button>
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/60 transition">
                  <td className="p-3 font-semibold text-slate-900">
                    성수 VIP 런칭 파티
                    <span className="block text-[11px] text-slate-400 font-normal">글로우랩 코스메틱</span>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-medium text-[11px]">오프라인</span>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      RSVP 마감임박
                    </span>
                  </td>
                  <td className="p-3 font-medium">28 / 30명</td>
                  <td className="p-3 font-mono text-slate-600">09/15 18:00</td>
                  <td className="p-3">
                    <button className="text-purple-600 hover:text-purple-800 font-semibold text-[11px]">체크인 →</button>
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/60 transition">
                  <td className="p-3 font-semibold text-slate-900">
                    인스타 텍스처 릴스 2차
                    <span className="block text-[11px] text-slate-400 font-normal">공식 인스타그램</span>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-pink-50 text-pink-700 font-medium text-[11px]">SNS 채널</span>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      광고주 컨펌완료
                    </span>
                  </td>
                  <td className="p-3 font-medium">-</td>
                  <td className="p-3 font-mono text-slate-600">09/02 18:00</td>
                  <td className="p-3">
                    <button className="text-pink-600 hover:text-pink-800 font-semibold text-[11px]">보기 →</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Urgent Attention Checklist */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>오늘의 긴급 조치 알림</span>
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px]">3건 대기</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="flex items-center justify-between font-semibold text-slate-800">
                <span>이지은 (D-2 업로드 임박)</span>
                <span className="text-red-600 text-[11px]">오늘 마감</span>
              </div>
              <p className="text-slate-500 text-[11px]">제품 수령 완료 확인됨, 카톡 알림톡 발송 권장</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="flex items-center justify-between font-semibold text-slate-800">
                <span>성수 행사 잔여 2석 초청</span>
                <span className="text-amber-600 text-[11px]">정원 마감</span>
              </div>
              <p className="text-slate-500 text-[11px]">예비 후보자 3명 중 추가 확정 처리 필요</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="flex items-center justify-between font-semibold text-slate-800">
                <span>9월 2일 릴스 발행 예약</span>
                <span className="text-emerald-600 text-[11px]">컨펌 완료</span>
              </div>
              <p className="text-slate-500 text-[11px]">광고주 수정 없이 승인 완료됨</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}