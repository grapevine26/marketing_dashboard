"use client";

import { useState } from "react";
import { Campaign } from "@/lib/db/types";
import { Share2, Copy, Check, ExternalLink } from "lucide-react";

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
      title: "1. 광고주 사전조사 회신 링크",
      url: getFullUrl(`/pre-survey/${campaign.pre_survey_token}`),
      desc: "광고주가 직접 요구사항을 작성하는 링크 (AI 지원 탑재)",
    },
    {
      key: "apply_form",
      title: "2. 인플루언서 지원 신청폼 링크",
      url: getFullUrl(`/apply/${campaign.apply_form_token}`),
      desc: "인플루언서가 직접 지원서를 제출하는 공개 접수 링크",
    },
    {
      key: "applicants_share",
      title: "3. 광고주 지원자 선정 공유 링크",
      url: getFullUrl(`/applicants/${campaign.applicants_share_token}`),
      desc: "광고주가 로그인 없이 지원자를 검토하고 최종/예비 선정하는 링크",
    },
    {
      key: "seeding_sheet_share",
      title: "4. 광고주 시딩 관리시트 공유 링크",
      url: getFullUrl(`/seeding-sheet/${campaign.seeding_sheet_share_token}`),
      desc: "광고주가 실시간 배송 및 업로드 성과를 조회하는 전용 링크",
    },
  ];

  const handleCopy = (key: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
      <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
        <Share2 className="w-4 h-4 text-blue-400" />
        <span>캠페인 외부 공유 전용 링크 (토큰 기반 무로그인)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {links.map((item) => (
          <div
            key={item.key}
            className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200">{item.title}</span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-blue-400 transition p-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">{item.desc}</p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-[#181A20]">
              <input
                type="text"
                readOnly
                value={item.url}
                className="w-full bg-transparent text-[11px] text-zinc-400 font-mono focus:outline-none truncate"
              />
              <button
                type="button"
                onClick={() => handleCopy(item.key, item.url)}
                className="px-2.5 py-1 rounded-lg bg-[#181A20] hover:bg-[#22242A] text-zinc-300 text-xs font-medium shrink-0 inline-flex items-center gap-1 transition"
              >
                {copiedKey === item.key ? (
                  <>
                    <Check className="w-3 h-3 text-blue-400" />
                    <span className="text-blue-400">복사됨</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-zinc-400" />
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