"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Campaign, CampaignTokenType } from "@/lib/db/types";
import { useOrigin } from "@/components/useOrigin";
import { Share2, Copy, Check, ExternalLink, RotateCcw, ShieldAlert, Loader2, X } from "lucide-react";
import { regenerateCampaignTokenAction } from "./actions";

export default function TokenShareBox({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [currentCampaign, setCurrentCampaign] = useState<Campaign>(campaign);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ key: CampaignTokenType; title: string } | null>(null);
  const [reissuing, setReissuing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // SSR에서는 ""이고 클라이언트에서 origin이 채워진다 (하이드레이션 경고 없음)
  const origin = useOrigin();

  const links: { key: CampaignTokenType; title: string; path: string; desc: string }[] = [
    {
      key: "pre_survey",
      title: "1. 광고주 사전조사 회신 링크",
      path: `/pre-survey/${currentCampaign.pre_survey_token}`,
      desc: "광고주가 직접 요구사항을 작성하는 링크 (AI 지원 탑재)",
    },
    {
      key: "apply_form",
      title: "2. 인플루언서 지원 신청폼 링크",
      path: `/apply/${currentCampaign.apply_form_token}`,
      desc: "인플루언서가 직접 지원서를 제출하는 공개 접수 링크",
    },
    {
      key: "applicants_share",
      title: "3. 광고주 지원자 선정 공유 링크",
      path: `/applicants/${currentCampaign.applicants_share_token}`,
      desc: "광고주가 로그인 없이 지원자를 검토하고 최종/예비 선정하는 링크",
    },
    {
      key: "seeding_sheet_share",
      title: "4. 광고주 시딩 관리시트 공유 링크",
      path: `/seeding-sheet/${currentCampaign.seeding_sheet_share_token}`,
      desc: "광고주가 실시간 배송 및 업로드 성과를 조회하는 전용 링크 (조회 전용)",
    },
  ];

  const handleCopy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      window.prompt("아래 링크를 복사하세요", url);
    }
  };

  const handleRegenerate = async () => {
    if (!confirmTarget) return;
    setReissuing(true);
    setError(null);
    setNotice(null);
    const res = await regenerateCampaignTokenAction(currentCampaign.id, confirmTarget.key);
    setReissuing(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCurrentCampaign(res.data);
    setNotice(`'${confirmTarget.title}' 링크가 새로 발급되었습니다. 이전 링크는 즉시 차단되었습니다.`);
    setConfirmTarget(null);
    router.refresh();
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div className="p-5 sm:p-7 rounded-3xl bg-surface border border-border space-y-4 shadow-xl font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-text">
          <Share2 className="w-4 h-4 text-blue-400" />
          <span>캠페인 외부 공유 전용 링크 (토큰 기반 무로그인)</span>
        </div>
        <span className="text-[11px] text-text-muted">
          링크 유출 시 개별 [재발급]을 통해 이전 주소를 즉시 무효화할 수 있습니다.
        </span>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {links.map((item) => {
          const url = `${origin}${item.path}`;
          return (
            <div
              key={item.key}
              className="p-4 rounded-2xl bg-bg border border-border space-y-2.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-text truncate">{item.title}</span>
                  <a
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-muted hover:text-blue-400 p-1 shrink-0"
                    title="새 창으로 링크 열기"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{item.desc}</p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-border">
                <input
                  type="text"
                  readOnly
                  value={url}
                  className="w-full bg-surface sm:bg-transparent px-2.5 py-1.5 sm:p-0 rounded-lg text-[11px] text-text-sub font-mono focus:outline-none truncate border sm:border-0 border-border"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(item.key, url)}
                    className="flex-1 sm:flex-none px-3 py-2 sm:py-1 rounded-lg bg-surface2 hover:bg-surface text-text-sub active:scale-95 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition border border-border"
                  >
                    {copiedKey === item.key ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-blue-400 font-bold">복사됨</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-text-muted" />
                        <span>링크 복사</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmTarget({ key: item.key, title: item.title })}
                    title="보안 링크 재발급 (이전 링크 즉시 무효화)"
                    className="px-2.5 py-2 sm:py-1 rounded-lg bg-surface2 hover:bg-amber-500/10 hover:border-amber-500/30 border border-border text-text-muted hover:text-warn text-xs font-medium inline-flex items-center justify-center gap-1 transition active:scale-95"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span className="text-[11px]">재발급</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 보안 재발급 확인 모달 */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-surface border border-amber-500/30 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-warn">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="text-sm font-bold text-text">공유 링크 재발급 (보안 회수)</h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="text-text-muted hover:text-text p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-bg border border-border space-y-1.5">
              <div className="text-xs font-bold text-text">{confirmTarget.title}</div>
              <p className="text-xs text-text-sub leading-relaxed">
                링크 고유 주소(토큰)를 즉시 새로운 난수로 교체합니다.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-warn leading-relaxed space-y-1">
              <p className="font-semibold text-warn">⚠️ 이전 링크 즉시 404 차단 안내</p>
              <p className="text-text-sub">
                재발급 즉시 이전에 공유되었던 기존 링크는 유효하지 않은 주소가 되어 외부 접근이 차단됩니다. 필요시 광고주나 담당자에게 새로운 링크를 다시 전달해야 합니다.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={reissuing}
                className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface text-text-sub text-xs font-medium transition border border-border"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={reissuing}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                {reissuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>새 링크로 재발급 진행</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

