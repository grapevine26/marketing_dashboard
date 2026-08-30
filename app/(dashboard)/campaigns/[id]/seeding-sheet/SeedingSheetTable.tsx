"use client";

import { useState } from "react";
import { Campaign, Applicant, SeedingRecord, ProgressStage } from "@/lib/db/types";
import { updateSeedingRecordAction } from "./actions";
import { getStagesForType } from "@/lib/seeding/stages";
import { calculateDDay } from "@/lib/seeding/dday";
import { Download, ExternalLink, Save, Check, Clock, AlertCircle, Eye, ThumbsUp } from "lucide-react";

interface RecordItem {
  applicant: Applicant;
  seeding: SeedingRecord;
}

export default function SeedingSheetTable({
  campaign,
  initialRecords,
  isReadOnly = false,
}: {
  campaign: Campaign;
  initialRecords: RecordItem[];
  isReadOnly?: boolean;
}) {
  const [records, setRecords] = useState<RecordItem[]>(initialRecords);
  const [savingId, setSavingId] = useState<string | null>(null);
  const stages = getStagesForType(campaign.campaign_type);

  const handleUpdate = async (
    seedingId: string,
    patch: Partial<SeedingRecord>
  ) => {
    setSavingId(seedingId);
    try {
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
    } finally {
      setSavingId(null);
    }
  };

  const totalViews = records.reduce((sum, r) => sum + (r.seeding.views || 0), 0);
  const totalEngagement = records.reduce((sum, r) => sum + (r.seeding.engagement || 0), 0);
  const uploadCompleted = records.filter(
    (r) => r.seeding.progress_stage === "업로드완료" || Boolean(r.seeding.upload_link)
  ).length;

  return (
    <div className="space-y-4">
      {/* Metric summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400">선정 인플루언서</div>
          <div className="text-xl font-bold text-white mt-1">{records.length}명</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400">업로드 완료율</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {records.length > 0
              ? `${Math.round((uploadCompleted / records.length) * 100)}% (${uploadCompleted}/${records.length})`
              : "0%"}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5 text-blue-400" /> 총 조회수
          </div>
          <div className="text-xl font-bold text-blue-400 mt-1">
            {totalViews.toLocaleString()}회
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <ThumbsUp className="w-3.5 h-3.5 text-amber-400" /> 총 인게이지먼트
          </div>
          <div className="text-xl font-bold text-amber-400 mt-1">
            {totalEngagement.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <a
          href={`/api/seeding-sheet/export?campaignId=${campaign.id}`}
          download
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>관리시트 CSV 내보내기</span>
        </a>
      </div>

      {/* Sheet Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
            <tr>
              <th className="p-3.5">인플루언서</th>
              <th className="p-3.5">진행 단계</th>
              <th className="p-3.5">업로드 기한 (D-day)</th>
              <th className="p-3.5">업로드 URL 링크</th>
              <th className="p-3.5">조회수</th>
              <th className="p-3.5">인게이지먼트</th>
              <th className="p-3.5">배송/방문 정보</th>
              {!isReadOnly && <th className="p-3.5">메모</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {records.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500">
                  최종 선정된 인플루언서가 없습니다. [지원자 관리] 메뉴에서 최종선정을 진행해주세요.
                </td>
              </tr>
            ) : (
              records.map(({ applicant, seeding }) => {
                const ddayInfo = calculateDDay(seeding.upload_deadline);
                return (
                  <tr key={seeding.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5 font-medium text-white">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-white">{applicant.name}</div>
                        <a
                          href={applicant.sns_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[140px]"
                        >
                          <span>{applicant.sns_link}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    </td>

                    {/* Stage selector or badge */}
                    <td className="p-3.5">
                      {isReadOnly ? (
                        <span className="inline-flex px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
                          {seeding.progress_stage}
                        </span>
                      ) : (
                        <select
                          value={seeding.progress_stage}
                          onChange={(e) =>
                            handleUpdate(seeding.id, {
                              progress_stage: e.target.value as ProgressStage,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                        >
                          {stages.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Deadline and D-day */}
                    <td className="p-3.5 space-y-1">
                      {isReadOnly ? (
                        <div className="text-slate-200">
                          {seeding.upload_deadline || "-"}
                        </div>
                      ) : (
                        <input
                          type="date"
                          value={seeding.upload_deadline || ""}
                          onChange={(e) =>
                            handleUpdate(seeding.id, { upload_deadline: e.target.value })
                          }
                          className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                        />
                      )}
                      {seeding.upload_deadline && (
                        <div>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              ddayInfo.isOverdue
                                ? "bg-red-500/20 text-red-400"
                                : ddayInfo.dday === 0
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-blue-500/20 text-blue-300"
                            }`}
                          >
                            <Clock className="w-2.5 h-2.5" />
                            {ddayInfo.label}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Upload link */}
                    <td className="p-3.5">
                      {isReadOnly ? (
                        seeding.upload_link ? (
                          <a
                            href={seeding.upload_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[140px]"
                          >
                            <span>링크 열기</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )
                      ) : (
                        <input
                          type="url"
                          value={seeding.upload_link || ""}
                          onBlur={(e) =>
                            handleUpdate(seeding.id, { upload_link: e.target.value })
                          }
                          onChange={(e) =>
                            setRecords((prev) =>
                              prev.map((r) =>
                                r.seeding.id === seeding.id
                                  ? {
                                      ...r,
                                      seeding: { ...r.seeding, upload_link: e.target.value },
                                    }
                                  : r
                              )
                            )
                          }
                          placeholder="https://..."
                          className="w-36 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                        />
                      )}
                    </td>

                    {/* Views */}
                    <td className="p-3.5">
                      {isReadOnly ? (
                        <span className="font-semibold text-slate-200">
                          {seeding.views.toLocaleString()}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          value={seeding.views || 0}
                          onBlur={(e) =>
                            handleUpdate(seeding.id, { views: Number(e.target.value) })
                          }
                          onChange={(e) =>
                            setRecords((prev) =>
                              prev.map((r) =>
                                r.seeding.id === seeding.id
                                  ? {
                                      ...r,
                                      seeding: {
                                        ...r.seeding,
                                        views: Number(e.target.value),
                                      },
                                    }
                                  : r
                              )
                            )
                          }
                          className="w-20 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500 font-mono"
                        />
                      )}
                    </td>

                    {/* Engagement */}
                    <td className="p-3.5">
                      {isReadOnly ? (
                        <span className="font-semibold text-slate-200">
                          {seeding.engagement.toLocaleString()}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          value={seeding.engagement || 0}
                          onBlur={(e) =>
                            handleUpdate(seeding.id, {
                              engagement: Number(e.target.value),
                            })
                          }
                          onChange={(e) =>
                            setRecords((prev) =>
                              prev.map((r) =>
                                r.seeding.id === seeding.id
                                  ? {
                                      ...r,
                                      seeding: {
                                        ...r.seeding,
                                        engagement: Number(e.target.value),
                                      },
                                    }
                                  : r
                              )
                            )
                          }
                          className="w-20 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500 font-mono"
                        />
                      )}
                    </td>

                    {/* Shipping or visit info */}
                    <td className="p-3.5 text-slate-400 max-w-[160px] truncate">
                      {campaign.campaign_type === "shipping"
                        ? seeding.shipping_address || applicant.shipping_address || "-"
                        : `${seeding.visit_scheduled_at || applicant.visit_schedule || "-"} (${
                            seeding.visit_party_size || applicant.visit_party_size || 1
                          }명)`}
                    </td>

                    {/* Notes */}
                    {!isReadOnly && (
                      <td className="p-3.5">
                        <input
                          type="text"
                          value={seeding.notes || ""}
                          onBlur={(e) =>
                            handleUpdate(seeding.id, { notes: e.target.value })
                          }
                          onChange={(e) =>
                            setRecords((prev) =>
                              prev.map((r) =>
                                r.seeding.id === seeding.id
                                  ? {
                                      ...r,
                                      seeding: { ...r.seeding, notes: e.target.value },
                                    }
                                  : r
                              )
                            )
                          }
                          placeholder="송장번호/특이사항"
                          className="w-28 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                        />
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}