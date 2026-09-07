"use client";

import { useState } from "react";
import { PublicSnsAccount, ReviewableSnsContent, SnsMediaAttachment } from "@/lib/db/types";
import { reviewSnsContentByTokenAction } from "./actions";
import { CheckCircle2, AlertCircle, MessageSquare, Loader2, Image as ImageIcon, Video as VideoIcon, ExternalLink, X } from "lucide-react";

export default function SnsApprovalClient({
  token,
  account,
  initialContents,
}: {
  token: string;
  account: PublicSnsAccount;
  initialContents: ReviewableSnsContent[];
}) {
  const [contents, setContents] = useState<ReviewableSnsContent[]>(initialContents);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; decision: string }[]>([]);
  const [activeMedia, setActiveMedia] = useState<SnsMediaAttachment | null>(null);

  const handleReview = async (c: ReviewableSnsContent, decision: "approve" | "request_changes") => {
    setError(null);
    const comment = comments[c.id]?.trim();
    if (decision === "request_changes" && !comment) {
      setError("수정 요청 사항을 입력해주세요.");
      return;
    }
    if (decision === "approve" && !confirm(`"${c.title}" 시안을 승인할까요?`)) return;

    setLoadingId(c.id);
    const res = await reviewSnsContentByTokenAction({ token, contentId: c.id, decision, comment });
    setLoadingId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setContents((prev) => prev.filter((x) => x.id !== c.id));
    setDone((prev) => [
      ...prev,
      { title: c.title, decision: res.data.changed ? (decision === "approve" ? "승인 완료" : "수정 요청 전달") : "이미 처리된 시안" },
    ]);
  };

  return (
    <div className="space-y-4">
      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}

      {done.length > 0 && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs space-y-1">
          {done.map((d, i) => (
            <div key={i}>✓ {d.title} — {d.decision}</div>
          ))}
        </div>
      )}

      {contents.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-surface border border-dashed border-border text-text-muted text-xs">
          현재 {account.company_name} 계정에 검토 대기 중인 콘텐츠 시안이 없습니다.
        </div>
      ) : (
        contents.map((c) => (
          <div key={c.id} className="p-6 rounded-3xl border bg-surface border-accent2/40 transition space-y-5 shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent2/15 text-accent2 border border-accent2/30">광고주 승인 대기중</span>
                <span className="text-xs text-text-muted font-mono">발행 예정: {c.scheduled_on || "미정"}</span>
              </div>
              <h2 className="text-base font-bold text-text">{c.title}</h2>
            </div>

            {/* Media Gallery (Image / Video drafts) */}
            {c.media_attachments && c.media_attachments.length > 0 && (
              <div className="p-4 rounded-2xl bg-bg border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-accent2">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>콘텐츠 시안 미디어 ({c.media_attachments.length}개)</span>
                  </div>
                  <span className="text-[11px] text-text-muted">클릭하여 확대 보기</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {c.media_attachments.map((m) => {
                    const mediaSrc = `${m.url}?token=${encodeURIComponent(token)}`;
                    const isVideo = m.mime_type.startsWith("video/");
                    return (
                      <div
                        key={m.id}
                        className="group relative rounded-2xl bg-surface border border-border hover:border-accent2/50 p-2.5 space-y-2 transition overflow-hidden"
                      >
                        {isVideo ? (
                          <div className="space-y-2">
                            <video
                              controls
                              playsInline
                              preload="metadata"
                              src={mediaSrc}
                              className="w-full h-44 rounded-xl bg-black object-contain"
                            />
                            <div className="flex items-center justify-between text-[11px] text-text-sub">
                              <span className="truncate max-w-[160px] font-medium inline-flex items-center gap-1" title={m.name}>
                                <VideoIcon className="w-3 h-3 text-accent2 shrink-0" />
                                <span className="truncate">{m.name}</span>
                              </span>
                              <span className="text-accent2 shrink-0 font-mono">{(m.size / (1024 * 1024)).toFixed(1)} MB</span>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveMedia(m)}
                            className="w-full text-left space-y-2 cursor-pointer"
                          >
                            <div className="w-full h-44 rounded-xl overflow-hidden bg-bg relative">
                              <img
                                src={mediaSrc}
                                alt={m.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold">
                                클릭하여 확대
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-text-sub">
                              <span className="truncate max-w-[160px] font-medium" title={m.name}>{m.name}</span>
                              <span className="text-accent2 shrink-0 font-mono">{(m.size / (1024 * 1024)).toFixed(1)} MB</span>
                            </div>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-bg border border-border space-y-2 text-xs">
              <span className="text-[11px] font-bold text-text-sub block">원고 및 캡션:</span>
              <p className="text-text leading-relaxed whitespace-pre-line">{c.caption || "작성된 캡션이 없습니다."}</p>
              {c.hashtags && <p className="text-accent2 font-medium">{c.hashtags}</p>}
            </div>

            {c.client_comment && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn-soft text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div><strong>이전 수정 요청:</strong> {c.client_comment}</div>
              </div>
            )}

            <div className="pt-3 border-t border-border space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  placeholder="수정 요청 사항 (수정 요청 시 필수, 예: 2번째 줄 문구 수정)"
                  value={comments[c.id] || ""}
                  onChange={(e) => setComments({ ...comments, [c.id]: e.target.value })}
                  className="w-full sm:flex-1 px-3.5 py-2 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-accent2"
                />
                <div className="flex w-full sm:w-auto items-center gap-2">
                  <button
                    type="button"
                    disabled={loadingId === c.id}
                    onClick={() => handleReview(c, "request_changes")}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-surface2 hover:bg-amber-500/20 text-warn border border-amber-500/30 text-xs font-bold transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {loadingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    <span>수정 요청</span>
                  </button>
                  <button
                    type="button"
                    disabled={loadingId === c.id}
                    onClick={() => handleReview(c, "approve")}
                    className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {loadingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>시안 승인 (컨펌)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Fullscreen Lightbox Modal for Advertiser */}
      {activeMedia && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-4xl w-full bg-surface border border-border rounded-3xl p-5 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-sm font-bold text-text truncate">{activeMedia.name}</h3>
                <p className="text-[11px] text-text-sub font-mono">
                  {(activeMedia.size / (1024 * 1024)).toFixed(2)} MB · {activeMedia.mime_type}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveMedia(null)}
                className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-text-sub hover:text-text transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center bg-black/60 rounded-2xl overflow-hidden max-h-[70vh] p-2">
              {activeMedia.mime_type.startsWith("image/") ? (
                <img
                  src={`${activeMedia.url}?token=${encodeURIComponent(token)}`}
                  alt={activeMedia.name}
                  className="max-h-[65vh] max-w-full object-contain rounded-xl"
                />
              ) : (
                <video
                  controls
                  autoPlay
                  playsInline
                  src={`${activeMedia.url}?token=${encodeURIComponent(token)}`}
                  className="max-h-[65vh] max-w-full rounded-xl bg-black"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <a
                href={`${activeMedia.url}?token=${encodeURIComponent(token)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>새 탭에서 원본 열기</span>
              </a>
              <button
                type="button"
                onClick={() => setActiveMedia(null)}
                className="px-4 py-2 rounded-xl bg-accent2 hover:bg-accent2/90 text-white text-xs font-semibold cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
