"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { AuditActorType, AuditLogEntry } from "@/lib/db/types";
import { fetchActivityAction } from "./actions";
import { safeCall } from "@/lib/actions/safeCall";
import { toKstDateString } from "@/lib/seeding/dday";
import { toast } from "@/components/Toast";
import {
  Activity,
  Building2,
  CalendarDays,
  ChevronDown,
  Globe,
  Loader2,
  Search,
  Server,
  UserCog,
  X,
} from "lucide-react";

/**
 * 전체 활동 기록 화면. 관리자 전용.
 *
 * 로그는 상한 없이 쌓이므로 한 번에 50건씩 받고 더 보기로 이어 붙인다.
 * 전체 개수를 세지 않는 이유는 서버 쪽 주석에 적어 두었다.
 */

const PAGE_SIZE = 50;

type EntityType = AuditLogEntry["entity_type"];

const ENTITY_LABELS: Record<EntityType, string> = {
  campaign: "캠페인",
  applicant: "지원자",
  seeding_record: "시딩",
  event: "행사",
  sns_account: "SNS 계정",
  sns_content: "SNS 콘텐츠",
  user: "계정",
};

const ACTOR_LABELS: Record<AuditActorType, string> = {
  agency: "에이전시",
  company: "광고주",
  public: "인플루언서",
  system: "시스템",
};

const ACTOR_STYLES: Record<AuditActorType, string> = {
  agency: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  company: "bg-amber-500/15 text-warn border-amber-500/20",
  public: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  system: "bg-surface3 text-text-muted border-border",
};

const ACTOR_ICONS: Record<AuditActorType, typeof UserCog> = {
  agency: UserCog,
  company: Building2,
  public: Globe,
  system: Server,
};

const PERIODS = [
  { key: "all", label: "전체", days: null },
  { key: "1", label: "오늘", days: 1 },
  { key: "7", label: "7일", days: 7 },
  { key: "30", label: "30일", days: 30 },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

function sinceFor(period: PeriodKey): string | undefined {
  const found = PERIODS.find((p) => p.key === period);
  if (!found?.days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - found.days + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * 같은 날짜끼리 묶는다. 오늘·어제는 말로 쓴다.
 *
 * 날짜 키는 한국 시간(Asia/Seoul)으로 고정한다. 서버는 UTC 로 돌아서 브라우저 로컬 시간으로 묶으면
 * 서버 렌더와 클라이언트 렌더의 묶음이 달라져 하이드레이션 경고가 난다(자정 전후 기록이 특히 그렇다).
 */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const key = toKstDateString(d);
  if (key === toKstDateString(new Date(now))) return "오늘";
  if (key === toKstDateString(new Date(now - 24 * 3600000))) return "어제";
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export default function ActivityClient({
  initialRows,
  initialHasMore,
  names,
}: {
  initialRows: AuditLogEntry[];
  initialHasMore: boolean;
  names: Record<string, string>;
}) {
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [actorTypes, setActorTypes] = useState<AuditActorType[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);

  const currentFilter = (offset: number) => ({
    entity_types: entityTypes.length ? entityTypes : undefined,
    actor_types: actorTypes.length ? actorTypes : undefined,
    since: sinceFor(period),
    search: search || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  /** 거르기가 바뀌면 처음부터 다시 받는다. */
  const reload = (next: {
    entityTypes?: EntityType[];
    actorTypes?: AuditActorType[];
    period?: PeriodKey;
    search?: string;
  }) => {
    const e = next.entityTypes ?? entityTypes;
    const a = next.actorTypes ?? actorTypes;
    const p = next.period ?? period;
    const s = next.search ?? search;
    startTransition(async () => {
      const res = await safeCall(
        fetchActivityAction({
          entity_types: e.length ? e : undefined,
          actor_types: a.length ? a : undefined,
          since: sinceFor(p),
          search: s || undefined,
          limit: PAGE_SIZE,
          offset: 0,
        })
      );
      if (!res.ok) {
        toast.error(res.error || "활동 기록을 불러오지 못했습니다.");
        return;
      }
      setRows(res.data.rows);
      setHasMore(res.data.hasMore);
    });
  };

  const loadMore = async () => {
    setLoadingMore(true);
    const res = await safeCall(fetchActivityAction(currentFilter(rows.length)));
    setLoadingMore(false);
    if (!res.ok) return toast.error(res.error || "더 불러오지 못했습니다.");
    setRows((prev) => [...prev, ...res.data.rows]);
    setHasMore(res.data.hasMore);
  };

  const toggleEntity = (t: EntityType) => {
    const next = entityTypes.includes(t) ? entityTypes.filter((x) => x !== t) : [...entityTypes, t];
    setEntityTypes(next);
    reload({ entityTypes: next });
  };

  const toggleActor = (t: AuditActorType) => {
    const next = actorTypes.includes(t) ? actorTypes.filter((x) => x !== t) : [...actorTypes, t];
    setActorTypes(next);
    reload({ actorTypes: next });
  };

  const pickPeriod = (p: PeriodKey) => {
    setPeriod(p);
    reload({ period: p });
  };

  /**
   * 타이핑을 멈추면 알아서 찾는다.
   *
   * 엔터를 눌러야 하는 방식은 화면에 그 안내가 없어 아무도 모른다.
   * 글자마다 서버를 부르지 않도록 잠깐(400ms) 기다렸다가 한 번만 부른다.
   */
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const next = value.trim();
      setSearch(next);
      reload({ search: next });
    }, 400);
  };
  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  const clearAll = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setEntityTypes([]);
    setActorTypes([]);
    setPeriod("all");
    setSearchInput("");
    setSearch("");
    reload({ entityTypes: [], actorTypes: [], period: "all", search: "" });
  };

  const filtered = entityTypes.length > 0 || actorTypes.length > 0 || period !== "all" || search !== "";

  // 날짜별로 묶어 보여준다.
  const groups: { day: string; items: AuditLogEntry[] }[] = [];
  for (const row of rows) {
    const day = dayLabel(row.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(row);
    else groups.push({ day, items: [row] });
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-text flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          활동 기록
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-text-sub">
          누가 언제 무엇을 바꿨는지 모두 남습니다. 관리자만 볼 수 있습니다.
        </p>
      </div>

      {/* 거르기 */}
      <div className="p-4 rounded-2xl bg-surface border border-border space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-text-muted w-12 shrink-0">대상</span>
          {(Object.keys(ENTITY_LABELS) as EntityType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleEntity(t)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                entityTypes.includes(t)
                  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                  : "bg-surface2 text-text-sub border-border hover:text-text"
              }`}
            >
              {ENTITY_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-text-muted w-12 shrink-0">행위자</span>
          {(Object.keys(ACTOR_LABELS) as AuditActorType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleActor(t)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                actorTypes.includes(t)
                  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                  : "bg-surface2 text-text-sub border-border hover:text-text"
              }`}
            >
              {ACTOR_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-text-muted w-12 shrink-0">기간</span>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pickPeriod(p.key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition inline-flex items-center gap-1 ${
                period === p.key
                  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                  : "bg-surface2 text-text-sub border-border hover:text-text"
              }`}
            >
              {p.key === "all" ? null : <CalendarDays className="w-3 h-3" />}
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="내용이나 사람 이름으로 찾기"
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-surface2 border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-blue-500/40"
            />
          </div>
          {filtered && (
            <button
              type="button"
              onClick={clearAll}
              className="px-2.5 py-2 rounded-xl bg-surface2 border border-border text-[11px] font-semibold text-text-sub hover:text-text transition inline-flex items-center gap-1 shrink-0"
            >
              <X className="w-3 h-3" />
              조건 해제
            </button>
          )}
        </div>
      </div>

      {/* 목록 */}
      {pending ? (
        <div className="py-16 text-center text-xs text-text-muted inline-flex items-center justify-center gap-2 w-full">
          <Loader2 className="w-4 h-4 animate-spin" />
          불러오는 중입니다
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-surface border border-border">
          <p className="text-sm text-text-sub">
            {filtered ? "조건에 맞는 기록이 없습니다." : "아직 기록된 활동이 없습니다."}
          </p>
          {filtered && (
            <button type="button" onClick={clearAll} className="mt-2 text-xs text-blue-400 hover:underline">
              조건 해제하고 전체 보기
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.day} className="space-y-2">
              <h2 className="text-[11px] font-bold text-text-muted px-1">{g.day}</h2>
              <div className="rounded-2xl bg-surface border border-border divide-y divide-border overflow-hidden">
                {g.items.map((log) => {
                  const Icon = ACTOR_ICONS[log.actor_type];
                  const context = log.campaign_id
                    ? names[log.campaign_id]
                    : log.account_id
                    ? names[log.account_id]
                    : undefined;
                  return (
                    <div key={log.id} className="p-3 sm:p-3.5 flex items-start gap-3">
                      <span
                        className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1 shrink-0 ${
                          ACTOR_STYLES[log.actor_type]
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        {ACTOR_LABELS[log.actor_type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-text leading-snug break-words">{log.summary}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-text-muted tabular-nums">
                          <span>
                            {new Date(log.created_at).toLocaleTimeString("ko-KR", {
                              timeZone: "Asia/Seoul",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {/* 로그인 전에 쌓인 기록과 공개 링크 경로에는 이름이 없다. */}
                          {log.actor_name && <span className="text-text-sub">{log.actor_name}</span>}
                          <span className="px-1 rounded bg-surface3 text-text-muted">
                            {ENTITY_LABELS[log.entity_type]}
                          </span>
                          {context && <span className="text-text-sub truncate max-w-[220px]">· {context}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-2.5 rounded-xl bg-surface2 border border-border text-xs font-semibold text-text-sub hover:text-text transition inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {loadingMore ? "불러오는 중" : "더 보기"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
