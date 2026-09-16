"use client";

import { useState } from "react";
import { PublicCampaign, ProgressStage, SeedingRecord } from "@/lib/db/types";
import { SeedingRow } from "@/lib/seeding/rows";
import { getStagesForType } from "@/lib/seeding/stages";
import { calculateDDay, ddayToneClass } from "@/lib/seeding/dday";
import { updateSeedingRecordAction } from "./actions";
import { Search, ExternalLink, Download, Loader2, FileSpreadsheet, Lock } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import DownloadFileButton from "@/components/DownloadFileButton";

/**
 * `temp_` 행 = 최종선정은 됐지만 시딩 레코드가 아직 없는 행(구버전 데이터).
 * 저장을 시도하면 서버 액션이 같은 뜻의 오류를 돌려주지만, 입력칸이 잠겨 있어
 * 그 메시지에 닿을 방법이 없다. 그래서 잠긴 이유를 행에서 바로 보여준다.
 */
const LOCKED_REASON = "관리시트 레코드가 아직 없어 입력이 잠겼습니다. 지원자 화면에서 선정 상태를 다시 지정해주세요.";
const isLocked = (r: SeedingRecord) => r.id.startsWith("temp_");

type Patch = {
  progress_stage?: ProgressStage;
  upload_deadline?: string | null;
  upload_link?: string | null;
  views?: number;
  engagement?: number;
  notes?: string | null;
};

export default function SeedingSheetTable({
  campaign,
  initialRecords,
  todayKst,
  isReadOnly = false,
  csvHref,
}: {
  campaign: PublicCampaign;
  initialRecords: SeedingRow[];
  /** 서버에서 KST로 계산한 오늘 날짜(YYYY-MM-DD). D-day는 이 값으로만 계산한다. */
  todayKst: string;
  isReadOnly?: boolean;
  csvHref: string;
}) {
  const [records, setRecords] = useState(initialRecords);
  // 탭에 복귀하면 RefreshOnFocus 가 router.refresh() 를 부르는데, refresh 는 서버 데이터만 다시 받고
  // useState 는 그대로 둔다. 그래서 prop 이 바뀐 것을 렌더 중에 알아채고 목록을 직접 갈아끼워야
  // 자리를 비운 사이 바뀐 내용이 보인다. (settings/users/UsersClient.tsx 와 같은 패턴)
  //
  // 입력 중이던 값이 날아가지 않는 이유:
  // 행 key 가 seeding.id 라 목록을 갈아끼워도 같은 행은 리마운트되지 않고 재사용된다. 그리고 React 는
  // 비제어 입력의 defaultValue 를 element.value 가 아니라 element.defaultValue 에만 쓴다. 사용자가
  // 이미 타이핑한 칸은 브라우저의 dirty 플래그가 서 있어 표시값이 유지되고, 손대지 않은 칸만 새 값으로 갱신된다.
  const [syncedFrom, setSyncedFrom] = useState(initialRecords);
  if (syncedFrom !== initialRecords) {
    setSyncedFrom(initialRecords);
    setRecords(initialRecords);
  }
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isShipping = campaign.campaign_type === "shipping";
  const stages = getStagesForType(campaign.campaign_type);

  /**
   * 한 칸을 저장한다.
   *
   * revert: 실패했을 때 입력칸을 원래 값으로 되돌리는 함수.
   * 이 표의 입력칸은 defaultValue 를 쓰는 비제어 입력이라, 저장이 거부돼도 DOM 에 값이 그대로 남아
   * 저장된 것처럼 보인다(새로고침하면 사라진다). 실패하면 반드시 되돌려야 한다.
   */
  const handleUpdate = async (seedingId: string, patch: Patch, revert?: () => void) => {
    if (isReadOnly) return;
    setError(null);
    setSavingId(seedingId);
    const res = await safeCall(updateSeedingRecordAction({ seedingId, campaignId: campaign.id, patch }));
    setSavingId(null);
    if (!res.ok) {
      setError(res.error);
      // 배너는 카드 맨 위에 있어 표 아래쪽을 편집 중이면 화면 밖이다. 토스트로도 알린다.
      toast.error(res.error || "저장하지 못했습니다.");
      revert?.();
      return;
    }
    const updated: SeedingRecord = res.data;
    setRecords((prev) => prev.map((r) => (r.seeding.id === seedingId ? { ...r, seeding: updated } : r)));
  };

  const q = search.trim().toLowerCase();
  const filtered = records.filter((r) => {
    if (!q) return true;
    return (
      r.applicant.name.toLowerCase().includes(q) ||
      r.applicant.contact.includes(q) ||
      r.applicant.sns_link.toLowerCase().includes(q) ||
      (r.seeding.notes && r.seeding.notes.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const displayedRecords = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const dday = (deadline: string | null) => {
    if (!deadline) return <span className="text-text-muted">-</span>;
    const info = calculateDDay(deadline, todayKst);
    return (
      <span className={`font-mono tabular-nums ${ddayToneClass(info.dday ?? 99)}`}>{info.label}</span>
    );
  };

  const stageSelect = (r: SeedingRecord) => {
    // 다른 유형의 단계가 저장돼 있는 구버전 데이터도 옵션에 남겨 값이 사라지지 않게 한다.
    const options = stages.includes(r.progress_stage) ? stages : [r.progress_stage, ...stages];
    return (
      <select
        aria-label="진행 단계"
        value={r.progress_stage}
        disabled={savingId === r.id || isLocked(r)}
        onChange={(e) => handleUpdate(r.id, { progress_stage: e.target.value as ProgressStage })}
        className="px-2.5 py-1 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500 font-semibold disabled:opacity-50"
      >
        {options.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    );
  };

  const numberInput = (r: SeedingRecord, key: "views" | "engagement", placeholder: string) => (
    <input
      type="number"
      min={0}
      step={1}
      defaultValue={r[key] || 0}
      placeholder={placeholder}
      disabled={isLocked(r)}
      onBlur={(e) => {
        const el = e.currentTarget;
        const original = String(r[key] || 0);
        const raw = el.value.trim();
        // 빈 칸은 "안 바꿈"으로 본다. Number("") 은 0 이라, 그냥 넘기면 500 이던 조회수가
        // 실수로 지우고 지나가는 것만으로 경고 없이 0 이 된다. 숫자칸에 글자를 넣어도 값은 "" 이 되므로
        // 잘못 입력한 경우도 여기서 같이 걸린다.
        if (raw === "") {
          el.value = original;
          return;
        }
        const n = Number(raw);
        if (n !== r[key]) handleUpdate(r.id, { [key]: n } as Patch, () => { el.value = original; });
      }}
      className="w-20 px-2 py-1 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500 font-mono tabular-nums"
    />
  );

  // 잠긴 행 안내. title 속성은 모바일에서 뜨지 않으므로 글자로 보여준다.
  const lockedNotice = (className: string) => (
    <p className={`flex items-start gap-1 text-[11px] font-normal text-amber-400 ${className}`}>
      <Lock className="w-3 h-3 mt-0.5 shrink-0" />
      <span>{LOCKED_REASON}</span>
    </p>
  );

  const stageBadge = (stage: ProgressStage) => (
    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[11px] font-semibold">{stage}</span>
  );

  return (
    <div className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl bg-surface border border-border space-y-5 sm:space-y-6 shadow-xl font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="인플루언서 이름, SNS, 메모 검색..."
            className="w-full pl-8 pr-3 py-2.5 sm:py-2 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500"
          />
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-3.5 sm:top-3" />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {savingId && <Loader2 className="w-4 h-4 animate-spin text-text-muted" />}
          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            {/*
              생 <a href> 로 받으면 서버가 4xx(예: "종료된 캠페인입니다.")를 줄 때 브라우저가 그 본문을
              문서로 그려 흰 화면만 남는다. 공용 버튼으로 바꿔 실패는 메시지로, 진행은 로딩으로 보여준다.
            */}
            <DownloadFileButton
              href={`${csvHref}&format=xlsx`}
              label="Excel 다운로드"
              fallbackFilename="시딩관리시트.xlsx"
              title="마이크로소프트 엑셀 서식 적용 파일 다운로드"
              icon={<FileSpreadsheet className="w-3.5 h-3.5 text-text-sub" />}
              className="w-full sm:w-auto text-center justify-center px-3.5 py-2.5 sm:py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-medium inline-flex items-center gap-1.5 transition border border-border active:scale-95 disabled:opacity-50"
            />
            <DownloadFileButton
              href={csvHref}
              label="CSV"
              fallbackFilename="시딩관리시트.csv"
              title="표준 CSV 파일 다운로드"
              icon={<Download className="w-3.5 h-3.5 text-text-sub" />}
              className="w-full sm:w-auto text-center justify-center px-3 py-2.5 sm:py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-medium inline-flex items-center gap-1.5 transition border border-border disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>
      )}

      {/* Mobile Card Layout */}
      <div className="block sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-xs border border-dashed border-border rounded-2xl bg-bg">
            선정된 인플루언서 시딩 데이터가 없습니다.
          </div>
        ) : (
          displayedRecords.map(({ applicant: app, seeding: r }) => (
            <div key={r.id} className="p-4 rounded-2xl bg-bg border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-text">{app.name}</span>
                <a href={app.sns_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs inline-flex items-center gap-1 truncate max-w-[150px]">
                  <span>{app.sns_link}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>

              {!isReadOnly && isLocked(r) && lockedNotice("")}

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-text-sub">진행 단계:</span>
                  {isReadOnly ? stageBadge(r.progress_stage) : stageSelect(r)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-sub">업로드 마감일:</span>
                  <div className="flex items-center gap-2">
                    {isReadOnly ? (
                      <span className="font-mono text-text">{r.upload_deadline || "-"}</span>
                    ) : (
                      <input
                        type="date"
                        aria-label="업로드 기한"
                        defaultValue={r.upload_deadline || ""}
                        disabled={isLocked(r)}
                        onBlur={(e) => {
                          const el = e.currentTarget;
                          const original = r.upload_deadline || "";
                          const v = el.value || null;
                          if (v !== r.upload_deadline) handleUpdate(r.id, { upload_deadline: v }, () => { el.value = original; });
                        }}
                        className="px-2 py-1 rounded-lg bg-surface border border-border text-text text-xs"
                      />
                    )}
                    {dday(r.upload_deadline)}
                  </div>
                </div>
                <div className="space-y-1 pt-1">
                  <span className="text-text-sub block text-[11px]">게시물 URL:</span>
                  {isReadOnly ? (
                    r.upload_link ? (
                      <a href={r.upload_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs inline-flex items-center gap-1 truncate max-w-full">
                        <span>{r.upload_link}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )
                  ) : (
                    <input
                      type="url"
                      defaultValue={r.upload_link || ""}
                      placeholder="https://..."
                      disabled={isLocked(r)}
                      onBlur={(e) => {
                        const el = e.currentTarget;
                        const original = r.upload_link || "";
                        const v = el.value.trim() || null;
                        if (v !== r.upload_link) handleUpdate(r.id, { upload_link: v }, () => { el.value = original; });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-none focus:border-blue-500"
                    />
                  )}
                </div>
                {!isReadOnly && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="space-y-1">
                      <span className="block text-[11px] text-text-muted">조회수</span>
                      {numberInput(r, "views", "조회수")}
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[11px] text-text-muted">반응수</span>
                      {numberInput(r, "engagement", "반응수")}
                    </label>
                  </div>
                )}
                {isReadOnly ? (
                  r.notes && <div className="text-text-sub">메모: {r.notes}</div>
                ) : (
                  <textarea
                    rows={2}
                    defaultValue={r.notes || ""}
                    placeholder="메모 (송장번호, 특이사항 등)"
                    disabled={isLocked(r)}
                    onBlur={(e) => {
                      const el = e.currentTarget;
                      const original = r.notes || "";
                      const v = el.value.trim() || null;
                      if (v !== r.notes) handleUpdate(r.id, { notes: v }, () => { el.value = original; });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text text-xs focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block rounded-2xl border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-bg text-text-sub border-b border-border">
            <tr>
              <th className="p-3.5 whitespace-nowrap">인플루언서</th>
              <th className="p-3.5 whitespace-nowrap">SNS 계정</th>
              {!isReadOnly && <th className="p-3.5 whitespace-nowrap">{isShipping ? "배송지" : "방문 일정 / 인원"}</th>}
              <th className="p-3.5 whitespace-nowrap">진행 단계</th>
              <th className="p-3.5 whitespace-nowrap">업로드 마감일</th>
              <th className="p-3.5 whitespace-nowrap">D-day</th>
              <th className="p-3.5 whitespace-nowrap">포스팅 URL</th>
              <th className="p-3.5 whitespace-nowrap">조회수 / 인게이지먼트</th>
              <th className="p-3.5 whitespace-nowrap">메모</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-text-2">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isReadOnly ? 8 : 9} className="p-8 text-center text-text-muted">
                  선정된 인플루언서 시딩 데이터가 없습니다. 먼저 지원자를 최종선정해주세요.
                </td>
              </tr>
            ) : (
              displayedRecords.map(({ applicant: app, seeding: r }) => (
                <tr key={r.id} className="hover:bg-surface2 transition">
                  <td className="p-3.5 font-bold text-text whitespace-nowrap min-w-[112px]">
                    {app.name}
                    {/* 표가 좌우로 잘리므로 항상 보이는 첫 칸에 둔다. */}
                    {!isReadOnly && isLocked(r) && lockedNotice("mt-1 whitespace-normal max-w-[200px]")}
                  </td>
                  <td className="p-3.5">
                    <a href={app.sns_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[130px]">
                      <span>{app.sns_link}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </td>
                  {!isReadOnly && (
                    <td className="p-3.5 text-text-sub">
                      {isShipping ? (
                        <div className="truncate max-w-[150px]" title={app.shipping_address}>{app.shipping_address || "-"}</div>
                      ) : (
                        <div>{app.visit_schedule || "-"} ({app.visit_party_size || 1}명)</div>
                      )}
                    </td>
                  )}
                  <td className="p-3.5">{isReadOnly ? stageBadge(r.progress_stage) : stageSelect(r)}</td>
                  <td className="p-3.5">
                    {isReadOnly ? (
                      <span className="font-mono text-text-2">{r.upload_deadline || "-"}</span>
                    ) : (
                      <input
                        type="date"
                        aria-label="업로드 기한"
                        defaultValue={r.upload_deadline || ""}
                        disabled={isLocked(r)}
                        onBlur={(e) => {
                          const el = e.currentTarget;
                          const original = r.upload_deadline || "";
                          const v = el.value || null;
                          if (v !== r.upload_deadline) handleUpdate(r.id, { upload_deadline: v }, () => { el.value = original; });
                        }}
                        className="px-2 py-1 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </td>
                  <td className="p-3.5">{dday(r.upload_deadline)}</td>
                  <td className="p-3.5">
                    {isReadOnly ? (
                      r.upload_link ? (
                        <a href={r.upload_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1">
                          <span>게시물 보기</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        "-"
                      )
                    ) : (
                      <input
                        type="url"
                        defaultValue={r.upload_link || ""}
                        placeholder="https://..."
                        disabled={isLocked(r)}
                        onBlur={(e) => {
                          const el = e.currentTarget;
                          const original = r.upload_link || "";
                          const v = el.value.trim() || null;
                          if (v !== r.upload_link) handleUpdate(r.id, { upload_link: v }, () => { el.value = original; });
                        }}
                        className="w-36 px-2 py-1 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </td>
                  <td className="p-3.5 font-mono tabular-nums">
                    {isReadOnly ? (
                      <span>{(r.views || 0).toLocaleString()}회 / {(r.engagement || 0).toLocaleString()}개</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {numberInput(r, "views", "조회수")}
                        {numberInput(r, "engagement", "반응수")}
                      </div>
                    )}
                  </td>
                  <td className="p-3.5">
                    {isReadOnly ? (
                      <span className="text-text-sub truncate max-w-[160px] block" title={r.notes || ""}>{r.notes || "-"}</span>
                    ) : (
                      <input
                        type="text"
                        defaultValue={r.notes || ""}
                        placeholder="송장번호, 특이사항"
                        disabled={isLocked(r)}
                        onBlur={(e) => {
                          const el = e.currentTarget;
                          const original = r.notes || "";
                          const v = el.value.trim() || null;
                          if (v !== r.notes) handleUpdate(r.id, { notes: v }, () => { el.value = original; });
                        }}
                        className="w-36 px-2 py-1 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-text-sub">
          <span>
            총 {filtered.length}건 중 {(page - 1) * PAGE_SIZE + 1} ~{" "}
            {Math.min(page * PAGE_SIZE, filtered.length)}건 표시
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 disabled:opacity-40 border border-border font-medium transition"
            >
              이전
            </button>
            <span className="px-3 py-1.5 rounded-xl bg-bg border border-border font-mono text-text">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 disabled:opacity-40 border border-border font-medium transition"
            >
              다음
            </button>
          </div>
        </div>
      )}

      {!isReadOnly && (
        <p className="text-[11px] text-text-muted">입력칸에서 포커스가 빠져나가면 자동 저장됩니다. 단계는 {isShipping ? "배송형" : "방문형"} 기준으로만 표시됩니다.<span className="hidden sm:inline"> 칸이 잘려 보이면 표를 좌우로 밀어서 나머지를 볼 수 있습니다.</span></p>
      )}
    </div>
  );
}
