"use client";

import { useState } from "react";
import { Campaign, Applicant, SeedingRecord, ProgressStage } from "@/lib/db/types";
import { updateSeedingRecordAction } from "./actions";
import {
  Search,
  ExternalLink,
  Download,
  CheckCircle2,
  Clock,
  Save,
  Truck,
  MapPin,
  Calendar,
} from "lucide-react";

const STAGES: ProgressStage[] = [
  "선정완료",
  "발송완료",
  "가이드전달완료",
  "수령완료",
  "방문완료",
  "확정완료",
  "업로드완료",
];

export default function SeedingSheetTable({
  campaign,
  initialRecords,
  isReadOnly = false,
}: {
  campaign: Campaign;
  initialRecords: { applicant: Applicant; seeding: SeedingRecord }[];
  isReadOnly?: boolean;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [search, setSearch] = useState("");
  const isShipping = campaign.campaign_type === "shipping";

  const handleUpdate = async (
    seedingId: string,
    patch: {
      progress_stage?: ProgressStage;
      upload_deadline?: string | null;
      upload_link?: string | null;
      views?: number;
      engagement?: number;
      notes?: string | null;
    }
  ) => {
    await updateSeedingRecordAction({
      seedingId,
      campaignId: campaign.id,
      patch,
    });

    setRecords((prev) =>
      prev.map((r) =>
        r.seeding.id === seedingId
          ? { ...r, seeding: { ...r.seeding, ...patch } }
          : r
      )
    );
  };

  const filtered = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.applicant.name.toLowerCase().includes(q) ||
      r.applicant.contact.includes(q) ||
      r.applicant.sns_link.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-5 sm:p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 sm:space-y-6 shadow-xl font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="인플루언서 이름, 연락처 검색..."
            className="w-full pl-8 pr-3 py-2.5 sm:py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
          />
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-3.5 sm:top-3" />
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/seeding-sheet/export?campaignId=${campaign.id}`}
            className="w-full sm:w-auto text-center justify-center px-4 py-2.5 sm:py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition border border-[#22242A]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>관리시트 CSV 다운로드</span>
          </a>
        </div>
      </div>

      {/* Mobile Card Layout (< sm) */}
      <div className="block sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#090A0C]">
            선정된 인플루언서 시딩 데이터가 없습니다.
          </div>
        ) : (
          filtered.map(({ applicant: app, seeding: r }) => (
            <div
              key={r.id}
              className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-zinc-100">{app.name}</span>
                <a
                  href={app.sns_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-xs inline-flex items-center gap-1 truncate max-w-[150px]"
                >
                  <span>{app.sns_link}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">진행 단계:</span>
                  {isReadOnly ? (
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-semibold text-[11px]">
                      {r.progress_stage}
                    </span>
                  ) : (
                    <select
                      value={r.progress_stage}
                      onChange={(e) =>
                        handleUpdate(r.id, { progress_stage: e.target.value as ProgressStage })
                      }
                      className="px-2 py-1 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500 font-semibold"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">업로드 마감일:</span>
                  {isReadOnly ? (
                    <span className="font-mono text-zinc-200">{r.upload_deadline || "-"}</span>
                  ) : (
                    <input
                      type="date"
                      defaultValue={r.upload_deadline || ""}
                      onBlur={(e) => handleUpdate(r.id, { upload_deadline: e.target.value || null })}
                      className="px-2 py-1 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-200 text-xs"
                    />
                  )}
                </div>

                <div className="space-y-1 pt-1">
                  <span className="text-zinc-400 block text-[11px]">게시물 URL:</span>
                  {isReadOnly ? (
                    r.upload_link ? (
                      <a
                        href={r.upload_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline text-xs inline-flex items-center gap-1 truncate max-w-full"
                      >
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
                      onBlur={(e) => handleUpdate(r.id, { upload_link: e.target.value || null })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#131418] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500"
                    />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Data Table (sm+) */}
      <div className="hidden sm:block rounded-2xl border border-[#22242A] overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#090A0C] text-zinc-400 border-b border-[#22242A]">
            <tr>
              <th className="p-3.5">인플루언서</th>
              <th className="p-3.5">SNS 계정</th>
              <th className="p-3.5">{isShipping ? "배송지 / 송장" : "방문 일정 / 인원"}</th>
              <th className="p-3.5">진행 단계</th>
              <th className="p-3.5">업로드 마감일</th>
              <th className="p-3.5">포스팅 URL</th>
              <th className="p-3.5">조회수 / 인게이지먼트</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#22242A] text-zinc-300">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">
                  선정된 인플루언서 시딩 데이터가 없습니다. 먼저 지원자를 최종선정해주세요.
                </td>
              </tr>
            ) : (
              filtered.map(({ applicant: app, seeding: r }) => (
                <tr key={r.id} className="hover:bg-[#181A20] transition">
                  <td className="p-3.5 font-bold text-zinc-100">{app.name}</td>
                  <td className="p-3.5">
                    <a
                      href={app.sns_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[130px]"
                    >
                      <span>{app.sns_link}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </td>
                  <td className="p-3.5 text-zinc-400">
                    {isShipping ? (
                      <div className="truncate max-w-[150px]">{app.shipping_address || "-"}</div>
                    ) : (
                      <div>{app.visit_schedule || "-"} ({app.visit_party_size || 1}명)</div>
                    )}
                  </td>
                  <td className="p-3.5">
                    {isReadOnly ? (
                      <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-xs font-semibold">
                        {r.progress_stage}
                      </span>
                    ) : (
                      <select
                        value={r.progress_stage}
                        onChange={(e) =>
                          handleUpdate(r.id, { progress_stage: e.target.value as ProgressStage })
                        }
                        className="px-2.5 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500 font-semibold"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-3.5">
                    {isReadOnly ? (
                      <span className="font-mono text-zinc-300">{r.upload_deadline || "-"}</span>
                    ) : (
                      <input
                        type="date"
                        defaultValue={r.upload_deadline || ""}
                        onBlur={(e) => handleUpdate(r.id, { upload_deadline: e.target.value || null })}
                        className="px-2 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </td>
                  <td className="p-3.5">
                    {isReadOnly ? (
                      r.upload_link ? (
                        <a
                          href={r.upload_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline inline-flex items-center gap-1"
                        >
                          <span>확인</span>
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
                        onBlur={(e) => handleUpdate(r.id, { upload_link: e.target.value || null })}
                        className="w-32 px-2 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </td>
                  <td className="p-3.5">
                    {isReadOnly ? (
                      <span>{(r.views || 0).toLocaleString()}회 / {(r.engagement || 0).toLocaleString()}개</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          defaultValue={r.views || 0}
                          placeholder="조회수"
                          onBlur={(e) => handleUpdate(r.id, { views: Number(e.target.value) })}
                          className="w-16 px-2 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500"
                        />
                        <input
                          type="number"
                          defaultValue={r.engagement || 0}
                          placeholder="반응수"
                          onBlur={(e) => handleUpdate(r.id, { engagement: Number(e.target.value) })}
                          className="w-16 px-2 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}