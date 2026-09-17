"use client";

import { useState } from "react";
import { PublicSnsAccount, ReviewableSnsContent, SnsMediaAttachment } from "@/lib/db/types";
import { reviewSnsContentByTokenAction } from "./actions";
import { CheckCircle2, AlertCircle, MessageSquare, Loader2, Image as ImageIcon, Video as VideoIcon, ExternalLink, X, Download, Info } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";

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
  /**
   * 브라우저가 재생하지 못한 영상 첨부의 id.
   *
   * 아이폰으로 찍은 `.mov`(HEVC)는 업로드도 되고 파일명·용량도 멀쩡히 보이지만,
   * 크롬·파이어폭스에서는 코덱이 없어 **검은 화면**만 남는다. 광고주는 시안을 못 본 채로
   * 승인이나 수정요청을 눌러야 하고, 올린 직원은 그 사실을 알 길이 없다.
   * 그래서 `<video>` 가 실패하면(onError) 플레이어를 안내 카드로 바꿔 내려받기 경로를 준다.
   *
   * 다만 **실패가 늘 onError 로 오지는 않는다.** 컨테이너와 음성 코덱은 읽히는데 영상 코덱만
   * 없으면 오류 없이 검은 화면으로 재생되는 경우가 있다. 그래서 정상 재생 중인 영상에도
   * 내려받기 링크를 늘 같이 둔다 — 안내 카드는 확실히 실패한 경우의 추가 장치다.
   */
  const [unplayableMedia, setUnplayableMedia] = useState<Record<string, true>>({});
  const markUnplayable = (id: string) => setUnplayableMedia((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  /** 승인을 한 건이라도 눌렀는지. 되돌리는 방법을 안내할지 정한다. */
  const hasApproved = done.some((d) => d.decision === "승인 완료");

  const handleReview = async (c: ReviewableSnsContent, decision: "approve" | "request_changes") => {
    setError(null);
    const comment = comments[c.id]?.trim();
    if (decision === "request_changes" && !comment) {
      setError("수정 요청 사항을 입력해주세요.");
      // 시안이 여러 개면 맨 위 배너가 스크롤 밖이라, 버튼을 눌러도 아무 반응이 없어 보였다.
      // 배너는 그대로 두고, 화면 어디에서 눌러도 보이는 토스트를 같이 띄운다.
      toast.warning("수정 요청 사항을 입력해주세요.", {
        description: "어떤 부분을 고쳐야 할지 적어주시면 그대로 전달됩니다.",
      });
      return;
    }
    if (decision === "approve" && !confirm(`"${c.title}" 시안을 승인할까요?`)) return;

    setLoadingId(c.id);
    const res = await safeCall(reviewSnsContentByTokenAction({ token, contentId: c.id, decision, comment }));
    setLoadingId(null);
    if (!res.ok) {
      setError(res.error);
      toast.error(res.error || "처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setContents((prev) => prev.filter((x) => x.id !== c.id));
    setDone((prev) => [
      ...prev,
      { title: c.title, decision: res.data.changed ? (decision === "approve" ? "승인 완료" : "수정 요청 전달") : "이미 처리된 시안" },
    ]);
    // 처리하면 카드가 목록에서 사라지는 게 전부라, 접수가 됐는지 확인할 방법이 없었다.
    // 확대 보기 창(z-50)이 열린 채로 눌러도 토스트(z-9999)는 그 위에 보인다.
    if (!res.data.changed) {
      toast.info(`"${c.title}" 시안은 이미 처리된 상태입니다.`);
    } else if (decision === "approve") {
      // 되돌리는 방법은 위 완료 배너에도 남지만, 누른 직후가 실수를 알아채는 순간이라 여기서도 말한다.
      toast.success(`"${c.title}" 시안을 승인했습니다.`, {
        description: "잘못 누르셨다면 담당자에게 알려주세요. 다시 검토 요청을 받으실 수 있습니다.",
      });
    } else {
      toast.success(`"${c.title}" 수정 요청을 전달했습니다.`, {
        description: "요청하신 내용을 반영해 다시 시안을 보내드리겠습니다.",
      });
    }
  };

  return (
    <div className="space-y-4">
      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}

      {done.length > 0 && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs space-y-1">
          {done.map((d, i) => (
            <div key={i}>✓ {d.title} — {d.decision}</div>
          ))}
          {/*
            승인을 누르면 카드가 목록에서 사라지고 그것으로 끝이라, 잘못 눌러도 되돌릴 길이
            화면에 없었다. 실제로는 담당자가 상태를 [승인대기] 로 되돌리면 이 화면에 다시 나타나는데
            광고주는 그 사실을 모른다. 그래서 되돌리는 **방법**을 알려 준다.

            광고주가 스스로 되돌리는 버튼은 두지 않는다. 언제든 취소할 수 있는 승인은 승인이 아니고,
            대행사 입장에서는 "컨펌 받았다" 는 기준 시점이 사라진다. 담당자를 한 번 거치게 해서
            되돌린 사실이 기록에 남게 한다.
          */}
          {hasApproved && (
            <div className="mt-2 pt-2 border-t border-emerald-500/20 flex items-start gap-1.5 text-emerald-200/90">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                잘못 누르셨다면 담당자에게 알려주세요. 담당자가 다시 검토 요청을 보내면 이 화면에서 한 번 더 확인하실 수 있습니다.
              </p>
            </div>
          )}
        </div>
      )}

      {contents.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl sm:rounded-3xl bg-surface border border-dashed border-border text-text-muted text-xs">
          현재 {account.company_name} 계정에 검토 대기 중인 콘텐츠 시안이 없습니다.
        </div>
      ) : (
        contents.map((c) => (
          <div key={c.id} className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl border bg-surface border-accent2/40 transition space-y-4 sm:space-y-5 shadow-xl">
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
                            {unplayableMedia[m.id] ? (
                              // 재생 실패. 파일이 잘못된 게 아니라 이 브라우저에 코덱이 없는 경우가 대부분이라
                              // "안 됩니다" 로 끝내지 않고 바로 볼 수 있는 길을 준다.
                              <div className="w-full h-44 rounded-xl bg-bg border border-dashed border-amber-500/40 flex flex-col items-center justify-center gap-2 p-3 text-center">
                                <AlertCircle className="w-5 h-5 text-warn" />
                                <p className="text-[11px] text-warn-soft leading-relaxed">
                                  이 브라우저에서는 영상이 재생되지 않습니다.
                                  <br />
                                  파일을 내려받아 확인해주세요.
                                </p>
                                <a
                                  href={mediaSrc}
                                  download={m.name}
                                  className="px-3 py-1.5 rounded-lg bg-accent2 hover:bg-accent2/90 text-white text-[11px] font-bold inline-flex items-center gap-1.5"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>내려받아 보기</span>
                                </a>
                              </div>
                            ) : (
                              <video
                                controls
                                playsInline
                                preload="metadata"
                                src={mediaSrc}
                                onError={() => markUnplayable(m.id)}
                                className="w-full h-44 rounded-xl bg-black object-contain"
                              />
                            )}
                            <div className="flex items-center justify-between text-[11px] text-text-sub">
                              <span className="truncate max-w-[160px] font-medium inline-flex items-center gap-1" title={m.name}>
                                <VideoIcon className="w-3 h-3 text-accent2 shrink-0" />
                                <span className="truncate">{m.name}</span>
                              </span>
                              <span className="text-accent2 shrink-0 font-mono">{(m.size / (1024 * 1024)).toFixed(1)} MB</span>
                            </div>
                            {/*
                              재생이 되는 것처럼 보여도 실제로는 검은 화면인 경우(영상 코덱만 없을 때)가 있다.
                              그때는 onError 가 오지 않아 위 안내 카드가 뜨지 않으므로, 내려받기 길은 늘 열어 둔다.
                            */}
                            {!unplayableMedia[m.id] && (
                              <a
                                href={mediaSrc}
                                download={m.name}
                                className="text-[11px] text-text-muted hover:text-accent2 inline-flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                <span>화면이 검게 나오면 내려받아 보기</span>
                              </a>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveMedia(m)}
                            className="w-full text-left space-y-2 cursor-pointer"
                          >
                            <div className="w-full h-44 rounded-xl overflow-hidden bg-bg relative">
                              {/*
                                next/image 를 쓰지 않고 <img> 를 그대로 두는 이유 (이 화면의 시안 이미지 전부 동일):
                                1) 여기 이미지는 /api/media/[id] 가 승인 토큰을 확인하고 내려주는 비공개 시안 파일이다.
                                   next/image 최적화기는 토큰이 붙은 이 주소를 그대로 다루기 어렵고,
                                   최적화 결과가 캐시되면 토큰 검사를 건너뛰고 파일에 닿는 경로가 생긴다.
                                2) 업로드된 원본의 가로·세로 크기를 미리 알 수 없어 width/height 를 줄 수 없다.
                                3) Vercel 이미지 최적화는 요청당 과금인데 이 앱은 무료 요금제로 돌린다.
                              */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
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
                // 확대 보기도 같은 비공개 시안이다. 이유는 위쪽 첫 <img> 주석 참고.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${activeMedia.url}?token=${encodeURIComponent(token)}`}
                  alt={activeMedia.name}
                  className="max-h-[65vh] max-w-full object-contain rounded-xl"
                />
              ) : unplayableMedia[activeMedia.id] ? (
                // 확대 보기에서도 같은 안내를 준다. 여기서만 되는 줄 알고 다시 눌러 보는 일이 없도록.
                <div className="w-full py-12 flex flex-col items-center justify-center gap-3 text-center px-4">
                  <AlertCircle className="w-7 h-7 text-warn" />
                  <p className="text-xs text-warn-soft leading-relaxed">
                    이 브라우저에서는 영상이 재생되지 않습니다.
                    <br />
                    아이폰으로 촬영한 .mov 영상은 크롬·파이어폭스가 재생하지 못하는 경우가 있습니다.
                    <br />
                    파일을 내려받으면 정상적으로 확인하실 수 있습니다.
                  </p>
                </div>
              ) : (
                <video
                  controls
                  autoPlay
                  playsInline
                  src={`${activeMedia.url}?token=${encodeURIComponent(token)}`}
                  onError={() => markUnplayable(activeMedia.id)}
                  className="max-h-[65vh] max-w-full rounded-xl bg-black"
                />
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {/*
                내려받기는 재생이 안 될 때의 유일한 우회로다. 같은 출처(/api/media)라서
                download 속성이 그대로 먹는다(서버는 inline 으로 내려주지만 브라우저가 저장으로 바꾼다).
              */}
              <a
                href={`${activeMedia.url}?token=${encodeURIComponent(token)}`}
                download={activeMedia.name}
                className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>파일 내려받기</span>
              </a>
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
