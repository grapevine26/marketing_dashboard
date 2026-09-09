"use client";

import { useState } from "react";
import { AuditLogEntry } from "@/lib/db/types";
import { saveCampaignWebhookAction, testCampaignWebhookAction } from "./actions";
import {
  Bell,
  History,
  Check,
  AlertCircle,
  Loader2,
  Send,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";

interface CampaignIntegrationsCardProps {
  campaignId: string;
  initialWebhookUrl?: string;
  auditLogs: AuditLogEntry[];
}

export default function CampaignIntegrationsCard({
  campaignId,
  initialWebhookUrl = "",
  auditLogs,
}: CampaignIntegrationsCardProps) {
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showLogs, setShowLogs] = useState(true);

  const handleSaveWebhook = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setTestResult(null);
    const res = await safeCall(saveCampaignWebhookAction(campaignId, webhookUrl.trim() || null));
    setIsSaving(false);
    if (res.ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } else {
      setTestResult({ ok: false, message: res.error || "웹훅 저장 실패" });
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      setTestResult({ ok: false, message: "테스트할 웹훅 URL을 먼저 입력해주세요." });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    const res = await safeCall(testCampaignWebhookAction(campaignId, webhookUrl.trim()));
    setIsTesting(false);
    if (res.ok) {
      setTestResult({ ok: true, message: "웹훅 테스트 전송 성공! (HTTP 200 확인)" });
    } else {
      setTestResult({ ok: false, message: res.error || "웹훅 전송에 실패했습니다." });
    }
  };

  const actorBadge = (actor: AuditLogEntry["actor_type"]) => {
    switch (actor) {
      case "agency":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">
            에이전시
          </span>
        );
      case "company":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-warn border border-amber-500/20">
            광고주
          </span>
        );
      case "public":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            지원자
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface3 text-text-muted border border-border">
            시스템
          </span>
        );
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 font-sans">
      {/* 1. Webhook Reminder & Notification Settings */}
      <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-border space-y-4 shadow-xl flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-400" />
              <span>실시간 알림 웹훅 연동</span>
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-semibold">
              Slack / Discord
            </span>
          </div>
          <p className="text-xs text-text-sub leading-relaxed">
            새 인플루언서 지원 접수 및 최종선정 알림을 슬랙/디스코드 채널로 실시간 전송합니다.
          </p>

          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-text-sub">
              인커밍 웹훅 URL
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/... 또는 Discord Webhook URL"
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500 font-mono placeholder:text-text-muted"
            />
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
                testResult.ok
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}
            >
              {testResult.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <button
            type="button"
            disabled={isTesting || !webhookUrl.trim()}
            onClick={handleTestWebhook}
            className="px-3.5 py-2 rounded-xl bg-surface2 hover:bg-surface text-text-sub text-xs font-semibold border border-border transition inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>테스트 발송</span>
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveWebhook}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-3.5 h-3.5 text-text" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saveSuccess ? "저장 완료!" : "웹훅 저장"}</span>
          </button>
        </div>
      </div>

      {/* 2. Audit Log (감사 로그) */}
      <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-border space-y-4 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <History className="w-4 h-4 text-purple-400" />
              <span>캠페인 활동 감사 로그 (Audit Log)</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              className="text-xs text-text-muted hover:text-text flex items-center gap-1"
            >
              <span>{showLogs ? "접기" : "보기"}</span>
              {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-xs text-text-sub mt-1">
            지원자 선정, 메모 변경, 관리시트 수정 등 주요 작업의 실행 주체와 시각을 투명하게 기록합니다.
          </p>
        </div>

        {showLogs && (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted border border-dashed border-border rounded-xl bg-bg">
                아직 기록된 활동 로그가 없습니다.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-bg border border-border text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {actorBadge(log.actor_type)}
                      <span className="font-semibold text-text">{log.summary}</span>
                    </div>
                    <span className="text-[10px] text-text-muted font-mono">
                      {new Date(log.created_at).toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
