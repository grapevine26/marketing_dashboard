"use client";

import { useState } from "react";
import { PublicCampaign, ProgressStage, SeedingRecord } from "@/lib/db/types";
import { SeedingRow } from "@/lib/seeding/rows";
import { getStagesForType } from "@/lib/seeding/stages";
import { calculateDDay, ddayToneClass } from "@/lib/seeding/dday";
import { updateSeedingRecordAction } from "./actions";
import { Search, ExternalLink, Download, Loader2 } from "lucide-react";

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
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isShipping = campaign.campaign_type === "shipping";
  const stages = getStagesForType(campaign.campaign_type);

  const handleUpdate = async (seedingId: string, patch: Patch) => {
    if (isReadOnly) return;
    setError(null);
    setSavingId(seedingId);
    const res = await updateSeedingRecordAction({ seedingId, campaignId: campaign.id, patch });
    setSavingId(null);
    if (!res.ok) {
      setError(res.error);
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
      r.applicant.sns_link.toLowerCase().includes(q)
    );
  });

  const dday = (deadline: string | null) => {
    if (!deadline) return <span className="text-zinc-600">-</span>;
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
        value={r.progress_stage}
        disabled={savingId === r.id || r.id.startsWith("temp_")}
        onChange={(e) => handleUpdate(r.id, { progress_stage: e.target.value as ProgressStage })}
        className="px-2.5 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500 font-semibold disabled:opacity-50"
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
      disabled={r.id.startsWith("temp_")}
      onBlur={(e) => {
        const n = Number(e.target.value);
        if (n !== r[key]) handleUpdate(r.id, { [key]: n } as Patch);
      }}
      className="w-20 px-2 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500 font-mono tabular-nums"
    />
  );

  const stageBadge = (stage: ProgressStage) => (
    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[11px] font-semibold">{stage}</span>
  );

  return (
    <div className="p-5 sm:p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 sm:space-y-6 shadow-xl font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="인플루언서 이름, SNS 검색..."
            className="w-full pl-8 pr-3 py-2.5 sm:py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
          />
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-3.5 sm:top-3" />
        </div>

        <div className="flex items-center gap-3">
          {savingId && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
          <a
            href={csvHref}
            className="w-full sm:w-auto text-center justify-center px-4 py-2.5 sm:py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition border border-[#22242A]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>관리시트 CSV 다운로드</span>
          </a>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>
      )}

      {/* Mobile Card Layout */}
      <div className="block sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#090A0C]">
            선정된 인플루언서 시딩 데이터가 없습니다.
          </div>
        ) : (
          filtered.map(({ applicant: app, seeding: r }) => (
            <div key={r.id} className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-zinc-100">{app.name}</span>
                <a href={app.sns_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs inline-flex items-center gap-1 truncate max-w-[150px]">
                  <span>{app.sns_link}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">진행 단계:</span>
                  {isReadOnly ? stageBadge(r.progress_stage) : stageSelect(r)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">업로드 마감일:</span>
                  <div className="flex items-center gap-2">
                    {isReadOnly ? (
                      <span className="font-mono text-zinc-200">{r.upload_deadline || "-"}</span>
                    ) : (
                      <input
                        type="date"
                        defaultValue={r.upload_deadline || ""}
                        disabled={r.id.startsWith("temp_")}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== r.upload_deadline) handleUpdate(r.id, { upload_deadline: v });
                        }}
                        className="px-2 py-1 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-200 text-xs"
                      />
                    )}
                    {dday(r.upload_deadline)}
                  </div>
                </div>
                <div className="space-y-1 pt-1">
                  <span className="text-zinc-400 block text-[11px]">게시물 URL:</span>
                  {isReadOnly ? (
                    r.upload_link ? (
                      <a href={r.upload_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs inline-flex items-center gap-1 truncate max-w-full">
                        <span>{r.upload_link}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )
                  ) : (
                    <input
                      type="url"
                      defaultValue={r.upload_link || ""}
                      placeholder="https://..."
                      disabled={r.id.startsWith("temp_")}
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v !== r.upload_link) handleUpdate(r.id, { upload_link: v });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500"
                    />
                  )}
                </div>
                {!isReadOnly && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {numberInput(r, "views", "조회수")}
                    {numberInput(r, "engagement", "반응수")}
                  </div>
                )}
                {isReadOnly ? (
                  r.notes && <div className="text-zinc-400">메모: {r.notes}</div>
                ) : (
                  <textarea
                    rows={2}
                    defaultValue={r.notes || ""}
                    placeholder="메모 (송장번호, 특이사항 등)"
                    disabled={r.id.startsWith("temp_")}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== r.notes) handleUpdate(r.id, { notes: v });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block rounded-2xl border border-[#22242A] overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#090A0C] text-zinc-400 border-b border-[#22242A]">
            <tr>
              <th className="p-3.5">인플루언서</th>
              <th className="p-3.5">SNS 계정</th>
              {!isReadOnly && <th className="p-3.5">{isShipping ? "배송지" : "방문 일정 / 인원"}</th>}
              <th className="p-3.5">진행 단계</th>
              <th className="p-3.5">업로드 마감일</th>
              <th className="p-3.5">D-day</th>
              <th className="p-3.5">포스팅 URL</th>
              <th className="p-3.5">조회수 / 인게이지먼트</th>
              <th className="p-3.5">메모</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#22242A] text-zinc-300">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isReadOnly ? 8 : 9} className="p-8 text-center text-zinc-500">
                  선정된 인플루언서 시딩 데이터가 없습니다. 먼저 지원자를 최종선정해주세요.
                </td>
              </tr>
            ) : (
              filtered.map(({ applicant: app, seeding: r }) => (
                <tr key={r.id} className="hover:bg-[#181A20] transition">
                  <td className="p-3.5 font-bold text-zinc-100">{app.name}</td>
                  <td className="p-3.5">
                    <a href={app.sns_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[130px]">
                      <span>{app.sns_link}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </td>
                  {!isReadOnly && (
                    <td className="p-3.5 text-zinc-400">
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
                      <span className="font-mono text-zinc-300">{r.upload_deadline || "-"}</span>
                    ) : (
                      <input
                        type="date"
                        defaultValue={r.upload_deadline || ""}
                        disabled={r.id.startsWith("temp_")}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== r.upload_deadline) handleUpdate(r.id, { upload_deadline: v });
                        }}
                        className="px-2 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500"
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
                        disabled={r.id.startsWith("temp_")}
                        onBlur={(e) => {
                          const v = e.target.value.trim() || null;
                          if (v !== r.upload_link) handleUpdate(r.id, { upload_link: v });
                        }}
                        className="w-36 px-2 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500"
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
                      <span className="text-zinc-400 truncate max-w-[160px] block" title={r.notes || ""}>{r.notes || "-"}</span>
                    ) : (
                      <input
                        type="text"
                        defaultValue={r.notes || ""}
                        placeholder="송장번호, 특이사항"
                        disabled={r.id.startsWith("temp_")}
                        onBlur={(e) => {
                          const v = e.target.value.trim() || null;
                          if (v !== r.notes) handleUpdate(r.id, { notes: v });
                        }}
                        className="w-36 px-2 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!isReadOnly && (
        <p className="text-[11px] text-zinc-500">입력칸에서 포커스가 빠져나가면 자동 저장됩니다. 단계는 {isShipping ? "배송형" : "방문형"} 기준으로만 표시됩니다.</p>
      )}
    </div>
  );
}
