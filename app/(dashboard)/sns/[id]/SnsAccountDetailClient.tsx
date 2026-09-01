"use client";

import { useState } from "react";
import {
  SnsAccount,
  SnsContent,
  SnsIntakeResponse,
  SnsPlan,
  PptTemplate,
  SnsContentStatus,
} from "@/lib/db/types";
import {
  createSnsContentAction,
  updateSnsContentAction,
  generateSnsAiCaptionAction,
} from "../actions";
import Link from "next/link";
import {
  Camera,
  Calendar,
  List,
  Sparkles,
  Share2,
  Copy,
  Check,
  ExternalLink,
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Loader2,
  Save,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function SnsAccountDetailClient({
  account,
  initialContents,
  intakeResponse,
  plan,
  templates,
}: {
  account: SnsAccount;
  initialContents: SnsContent[];
  intakeResponse: SnsIntakeResponse | null;
  plan: SnsPlan | null;
  templates: PptTemplate[];
}) {
  const [activeTab, setActiveTab] = useState<"calendar" | "list" | "intake">("calendar");
  const [contents, setContents] = useState<SnsContent[]>(initialContents);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Calendar month state
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });

  const [calYear, calMonth] = calendarMonth.split("-").map((v) => parseInt(v, 10));
  const daysInCalMonth = new Date(calYear, calMonth, 0).getDate();
  const firstDayOfCalMonth = new Date(calYear, calMonth - 1, 1).getDay();

  const handleCalPrev = () => {
    const d = new Date(calYear, calMonth - 2, 1);
    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleCalNext = () => {
    const d = new Date(calYear, calMonth, 1);
    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const calendarDays = [];
  for (let day = 1; day <= daysInCalMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayItems = contents.filter((c) => c.scheduled_on === dateStr);
    calendarDays.push({
      dayNum: day,
      dateStr,
      items: dayItems,
    });
  }

  // New Content Form
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newScheduledOn, setNewScheduledOn] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const [newHashtags, setNewHashtags] = useState("");
  const [newMediaNote, setNewMediaNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);

  // Performance Input State
  const [perfInputs, setPerfInputs] = useState<
    Record<string, { views: number; likes: number; comments: number; postUrl: string }>
  >({});

  const getFullUrl = (path: string) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}${path}`;
    }
    return `http://localhost:3000${path}`;
  };

  const handleCopy = (key: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAiCaption = async () => {
    if (!newTitle) {
      alert("콘텐츠 제목/주제를 먼저 입력해주세요.");
      return;
    }
    setLoadingAi(true);
    try {
      const res = await generateSnsAiCaptionAction({
        brandName: account.company_name,
        platform: account.platform,
        handle: account.handle,
        title: newTitle,
        scheduledOn: newScheduledOn || null,
        mediaNote: newMediaNote || null,
      });
      setNewCaption(res.caption);
      setNewHashtags(res.hashtags);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleCreateContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await createSnsContentAction({
        accountId: account.id,
        title: newTitle,
        scheduledOn: newScheduledOn || null,
        assignee: newAssignee || null,
        caption: newCaption || null,
        hashtags: newHashtags || null,
        mediaNote: newMediaNote || null,
      });
      setContents((prev) => [res.content, ...prev]);
      setNewModalOpen(false);
      setNewTitle("");
      setNewScheduledOn("");
      setNewAssignee("");
      setNewCaption("");
      setNewHashtags("");
      setNewMediaNote("");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (contentId: string, status: SnsContentStatus) => {
    await updateSnsContentAction(contentId, account.id, { status });
    setContents((prev) =>
      prev.map((c) => (c.id === contentId ? { ...c, status } : c))
    );
  };

  const handleSavePerformance = async (contentId: string) => {
    const input = perfInputs[contentId];
    if (!input) return;
    await updateSnsContentAction(contentId, account.id, {
      view_count: input.views,
      like_count: input.likes,
      comment_count: input.comments,
      post_url: input.postUrl,
    });
    setContents((prev) =>
      prev.map((c) =>
        c.id === contentId
          ? {
              ...c,
              view_count: input.views,
              like_count: input.likes,
              comment_count: input.comments,
              post_url: input.postUrl,
            }
          : c
      )
    );
    alert("성과 수치가 저장되었습니다.");
  };

  // Monthly Performance Aggregation
  const postedContents = contents.filter((c) => c.status === "posted");
  const totalViews = postedContents.reduce((acc, c) => acc + (c.view_count || 0), 0);
  const totalLikes = postedContents.reduce((acc, c) => acc + (c.like_count || 0), 0);
  const totalComments = postedContents.reduce((acc, c) => acc + (c.comment_count || 0), 0);
  return (
    <div className="space-y-6 font-sans">
      {/* Top Header Card */}
      <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold uppercase">
                {account.platform}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                account.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-500"
              }`}>
                {account.status === "active" ? "운영중" : "계약종료"}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-100">{account.company_name}</h1>
            <p className="text-xs text-sky-400 font-mono">@{account.handle}</p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/sns/${account.id}/plan`}
              className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95"
            >
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>SNS 운영안 (웹/PPT)</span>
            </Link>
            <button
              type="button"
              onClick={() => setNewModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>새 콘텐츠 기획</span>
            </button>
          </div>
        </div>

        {/* 2 Public Share Links Box */}
        <div className="pt-3 border-t border-[#22242A] grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200">1. 광고주 자료요청 / 사전설문 링크</span>
              <a
                href={`/sns-intake/${account.intake_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-sky-400 p-0.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-[11px] text-zinc-500">브랜드 톤앤매너 및 중점 프로모션을 수집하는 무로그인 공개 링크</p>
            <button
              type="button"
              onClick={() => handleCopy("intake", getFullUrl(`/sns-intake/${account.intake_token}`))}
              className="w-full py-1.5 rounded-lg bg-[#131418] hover:bg-[#181A20] border border-[#22242A] text-xs font-medium text-zinc-300 inline-flex items-center justify-center gap-1.5 transition"
            >
              {copiedKey === "intake" ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
              <span>{copiedKey === "intake" ? "복사완료!" : "사전설문 링크 복사"}</span>
            </button>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200">2. 광고주 시안 승인(컨펌) 링크</span>
              <a
                href={`/sns-approval/${account.approval_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-sky-400 p-0.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-[11px] text-zinc-500">승인대기 콘텐츠를 확인하고 승인/수정요청을 처리하는 전용 링크</p>
            <button
              type="button"
              onClick={() => handleCopy("approval", getFullUrl(`/sns-approval/${account.approval_token}`))}
              className="w-full py-1.5 rounded-lg bg-[#131418] hover:bg-[#181A20] border border-[#22242A] text-xs font-medium text-zinc-300 inline-flex items-center justify-center gap-1.5 transition"
            >
              {copiedKey === "approval" ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
              <span>{copiedKey === "approval" ? "복사완료!" : "승인 공유 링크 복사"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Performance Aggregation KPI */}
      <div className="p-5 rounded-3xl bg-[#131418] border border-[#22242A] space-y-3 shadow-xl">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-bold text-zinc-100">게시 완료 콘텐츠 총 누적 성과</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          <div className="p-3.5 rounded-2xl bg-[#090A0C] border border-[#22242A]">
            <div className="text-[11px] text-zinc-500 font-sans">발행 완료</div>
            <div className="text-lg font-bold text-zinc-200">{postedContents.length}건</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#090A0C] border border-[#22242A]">
            <div className="text-[11px] text-zinc-500 font-sans">총 누적 조회수</div>
            <div className="text-lg font-bold text-sky-400">{totalViews.toLocaleString()}회</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#090A0C] border border-[#22242A]">
            <div className="text-[11px] text-zinc-500 font-sans">총 누적 좋아요</div>
            <div className="text-lg font-bold text-blue-400">{totalLikes.toLocaleString()}개</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#090A0C] border border-[#22242A]">
            <div className="text-[11px] text-zinc-500 font-sans">총 누적 댓글수</div>
            <div className="text-lg font-bold text-indigo-400">{totalComments.toLocaleString()}개</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#22242A] pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === "calendar"
              ? "bg-sky-600/15 text-sky-400 border border-sky-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>콘텐츠 캘린더 (월별 뷰)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === "list"
              ? "bg-sky-600/15 text-sky-400 border border-sky-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <List className="w-3.5 h-3.5" />
          <span>콘텐츠 목록 및 성과 관리 ({contents.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("intake")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === "intake"
              ? "bg-sky-600/15 text-sky-400 border border-sky-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>광고주 사전설문 답변</span>
        </button>
      </div>

      {/* 1. Monthly Calendar View */}
      {activeTab === "calendar" && (
        <div className="p-5 sm:p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl font-sans">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-sky-400" />
              <h2 className="text-base font-bold text-zinc-100">
                {calYear}년 {calMonth}월 SNS 콘텐츠 발행 스케줄
              </h2>
            </div>

            <div className="flex items-center gap-1 bg-[#090A0C] p-1 rounded-xl border border-[#22242A]">
              <button
                type="button"
                onClick={handleCalPrev}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#181A20] transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-zinc-200 px-2 font-mono">
                {calYear}.{String(calMonth).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={handleCalNext}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#181A20] transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 7-Columns Calendar Grid */}
          <div className="border border-[#22242A] rounded-2xl overflow-hidden bg-[#090A0C]">
            <div className="grid grid-cols-7 text-center text-xs font-bold text-zinc-400 border-b border-[#22242A] bg-[#131418] py-2.5">
              <div className="text-red-400">일</div>
              <div>월</div>
              <div>화</div>
              <div>수</div>
              <div>목</div>
              <div>금</div>
              <div className="text-blue-400">토</div>
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-[#22242A]">
              {Array.from({ length: firstDayOfCalMonth }).map((_, idx) => (
                <div key={`blank-${idx}`} className="h-28 sm:h-32 bg-[#090A0C]/40" />
              ))}

              {calendarDays.map((cell) => (
                <div
                  key={cell.dateStr}
                  onClick={() => {
                    setNewScheduledOn(cell.dateStr);
                    setNewModalOpen(true);
                  }}
                  className="h-28 sm:h-32 p-1.5 sm:p-2 flex flex-col justify-between hover:bg-[#181A20] cursor-pointer transition group"
                  title="클릭하여 이 날짜에 새 콘텐츠 기획"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-zinc-300 group-hover:text-sky-400">
                      {cell.dayNum}
                    </span>
                    {cell.items.length > 0 && (
                      <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-bold flex items-center justify-center font-mono">
                        {cell.items.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-20">
                    {cell.items.map((item) => (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab("list");
                        }}
                        className="p-1 rounded-md bg-[#131418] border border-[#22242A] text-[10px] space-y-0.5 truncate hover:border-sky-500/40"
                      >
                        <div className="flex items-center gap-1">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            item.status === "posted" ? "text-emerald-400" : item.status === "approved" ? "text-blue-400" : "text-sky-400"
                          }`}>
                            {item.status === "posted" ? "발행" : item.status === "approved" ? "승인" : "기획"}
                          </span>
                        </div>
                        <div className="font-bold text-zinc-200 truncate">{item.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. Content List View */}
      {activeTab === "list" && (
        <div className="space-y-4">
          <div className="space-y-3">
            {contents.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#131418]">
                등록된 콘텐츠가 없습니다. 상단의 [새 콘텐츠 기획]을 눌러 첫 콘텐츠를 등록하세요.
              </div>
            ) : (
              contents.map((c) => (
                <div
                  key={c.id}
                  className="p-5 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-md"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <select
                          value={c.status}
                          onChange={(e) =>
                            handleStatusChange(c.id, e.target.value as SnsContentStatus)
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-xs font-bold focus:outline-none focus:border-sky-500"
                        >
                          <option value="planning">1. 기획중</option>
                          <option value="producing">2. 제작중</option>
                          <option value="pending_approval">3. 승인대기</option>
                          <option value="approved">4. 승인완료</option>
                          <option value="posted">5. 게시완료 ✓</option>
                        </select>
                        <span className="text-xs text-zinc-400 font-mono">
                          예정: {c.scheduled_on || "미정"}
                        </span>
                        {c.assignee && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-[#090A0C] text-zinc-400">
                            담당: {c.assignee}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-zinc-100">{c.title}</h3>
                    </div>

                    {c.client_comment && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                        <strong>광고주 피드백:</strong> {c.client_comment}
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2 text-xs">
                    <span className="text-[11px] font-bold text-zinc-400 block">캡션 본문:</span>
                    <p className="text-zinc-200 leading-relaxed whitespace-pre-line">
                      {c.caption || "작성된 캡션이 없습니다."}
                    </p>
                    {c.hashtags && <p className="text-sky-400 font-medium">{c.hashtags}</p>}
                    {c.media_note && (
                      <div className="pt-2 border-t border-[#181A20] text-zinc-500">
                        <strong>내부 제작 메모:</strong> {c.media_note}
                      </div>
                    )}
                  </div>

                  {/* Performance Input Row (Shown only when status is 'posted') */}
                  {c.status === "posted" && (
                    <div className="pt-3 border-t border-[#22242A] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="url"
                          placeholder="게시 링크 (https://...)"
                          defaultValue={c.post_url || ""}
                          onChange={(e) =>
                            setPerfInputs((prev) => ({
                              ...prev,
                              [c.id]: {
                                ...(prev[c.id] || {
                                  views: c.view_count || 0,
                                  likes: c.like_count || 0,
                                  comments: c.comment_count || 0,
                                  postUrl: "",
                                }),
                                postUrl: e.target.value,
                              },
                            }))
                          }
                          className="w-48 px-2.5 py-1.5 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-100"
                        />
                        <input
                          type="number"
                          placeholder="조회수"
                          defaultValue={c.view_count || 0}
                          onChange={(e) =>
                            setPerfInputs((prev) => ({
                              ...prev,
                              [c.id]: {
                                ...(prev[c.id] || {
                                  views: 0,
                                  likes: c.like_count || 0,
                                  comments: c.comment_count || 0,
                                  postUrl: c.post_url || "",
                                }),
                                views: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-20 px-2.5 py-1.5 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-100 font-mono"
                        />
                        <input
                          type="number"
                          placeholder="좋아요"
                          defaultValue={c.like_count || 0}
                          onChange={(e) =>
                            setPerfInputs((prev) => ({
                              ...prev,
                              [c.id]: {
                                ...(prev[c.id] || {
                                  views: c.view_count || 0,
                                  likes: 0,
                                  comments: c.comment_count || 0,
                                  postUrl: c.post_url || "",
                                }),
                                likes: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-20 px-2.5 py-1.5 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-100 font-mono"
                        />
                        <input
                          type="number"
                          placeholder="댓글수"
                          defaultValue={c.comment_count || 0}
                          onChange={(e) =>
                            setPerfInputs((prev) => ({
                              ...prev,
                              [c.id]: {
                                ...(prev[c.id] || {
                                  views: c.view_count || 0,
                                  likes: c.like_count || 0,
                                  comments: 0,
                                  postUrl: c.post_url || "",
                                }),
                                comments: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-20 px-2.5 py-1.5 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-100 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleSavePerformance(c.id)}
                          className="px-3 py-1.5 rounded-lg bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>성과 저장</span>
                        </button>
                      </div>

                      {c.post_url && (
                        <a
                          href={c.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 hover:underline inline-flex items-center gap-1 shrink-0"
                        >
                          <span>게시물 바로가기</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Intake Response Tab */}
      {activeTab === "intake" && (
        <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-zinc-100">광고주 사전설문(자료요청) 응답 결과</h2>
            {intakeResponse && (
              <span className="text-xs text-zinc-500 font-mono">
                제출일: {new Date(intakeResponse.submitted_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {!intakeResponse ? (
            <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#090A0C]">
              아직 광고주가 설문을 제출하지 않았습니다. 상단의 [사전설문 링크 복사]를 통해 광고주에게 링크를 전달하세요.
            </div>
          ) : (
            <div className="space-y-4 divide-y divide-[#22242A]">
              {Object.entries(intakeResponse.answers).map(([key, val], idx) => (
                <div key={key} className={idx > 0 ? "pt-4 space-y-1.5" : "space-y-1.5"}>
                  <div className="text-xs font-bold text-sky-400">항목 {idx + 1}</div>
                  <div className="p-3.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-xs text-zinc-200 leading-relaxed whitespace-pre-line">
                    {val}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Content Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-[#131418] border-t sm:border border-[#22242A] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#22242A]">
              <h2 className="text-base font-bold text-zinc-100">신규 SNS 콘텐츠 기획안 등록</h2>
              <button onClick={() => setNewModalOpen(false)} className="text-zinc-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateContent} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">콘텐츠 제목 / 주제 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 3초 속건조 탈출! 하이드라 세럼 제형 릴스"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">발행 예정 일자</label>
                  <input
                    type="date"
                    value={newScheduledOn}
                    onChange={(e) => setNewScheduledOn(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">담당자</label>
                  <input
                    type="text"
                    placeholder="김콘텐츠 매니저"
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">내부 제작 메모 (비주얼 연출 등)</label>
                <textarea
                  rows={2}
                  placeholder="유리볼 롤링 클로즈업 촬영본 준비"
                  value={newMediaNote}
                  onChange={(e) => setNewMediaNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[#22242A]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300">캡션 본문 (카피)</label>
                  <button
                    type="button"
                    disabled={loadingAi}
                    onClick={handleAiCaption}
                    className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[11px] font-semibold inline-flex items-center gap-1 active:scale-95"
                  >
                    {loadingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>Gemini AI 문안 작성</span>
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="캡션 본문..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500 leading-relaxed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">해시태그</label>
                <input
                  type="text"
                  value={newHashtags}
                  onChange={(e) => setNewHashtags(e.target.value)}
                  placeholder="#글로우랩 #하이드라앰플"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-300 text-xs"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md disabled:opacity-50"
                >
                  {creating ? "등록 중..." : "기획안 등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}