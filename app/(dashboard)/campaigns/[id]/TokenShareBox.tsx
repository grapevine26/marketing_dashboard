"use client";

import { useState } from "react";
import { Campaign } from "@/lib/db/types";
import { Copy, Check, ExternalLink, Share2 } from "lucide-react";

export default function TokenShareBox({ campaign }: { campaign: Campaign }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const getFullUrl = (path: string) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}${path}`;
    }
    return `http://localhost:3000${path}`;
  };

  const links = [
    {
      key: "pre_survey",
      title: "1. 광고주 사전조사 링크",
      desc: "광고주가 사전 질문에 답변하고 요구사항을 전달하는 페이지",
      url: getFullUrl(`/pre-survey/${campaign.pre_survey_token}`),
    },
    {
      key: "apply_form",
      title: "2. 인플루언서 모집 신청폼 링크",
      desc: "인플루언서가 직접 프로필과 지원서를 접수하는 공개 페이지",
      url: getFullUrl(`/apply/${campaign.apply_form_token}`),
    },
    {
      key: "applicants_share",
      title: "3. 광고주 지원자리스트 공유 링크",
      desc: "광고주가 실시간 지원자 목록을 확인하고 직접 최종/예비선정하는 페이지",
      url: getFullUrl(`/applicants/${campaign.applicants_share_token}`),
    },
    {
      key: "seeding_sheet_share",
      title: "4. 광고주 관리시트 공유 링크",
      desc: "광고주가 시딩 진행 상황과 업로드 현황을 실시간 확인하는 페이지 (조회 전용)",
      url: getFullUrl(`/seeding-sheet/${campaign.seeding_sheet_share_token}`),
    },
  ];

  const handleCopy = (key: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
      <div className="flex items-center gap-2">
        <Share2 className="w-4 h-4 text-blue-400" />
        <h2 className="text-base font-bold text-white">외부 공유용 전용 토큰 링크</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {links.map((item) => (
          <div
            key={item.key}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 flex flex-col justify-between"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 text-xs">{item.title}</span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>열기</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-[11px] text-slate-400">{item.desc}</p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                readOnly
                value={item.url}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono truncate select-all"
              />
              <button
                type="button"
                onClick={() => handleCopy(item.key, item.url)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1 transition"
              >
                {copiedKey === item.key ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">복사됨</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>복사</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}