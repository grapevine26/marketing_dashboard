import { notFound } from "next/navigation";
import {
  getCampaignByToken,
  getSeedingRecordsByCampaignId,
  getApplicantsByCampaignId,
} from "@/lib/db";
import { Building2, ExternalLink, Download } from "lucide-react";

export const revalidate = 0;

export default async function PublicSeedingSheetSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const campaign = await getCampaignByToken("seeding_sheet_share", token);
  if (!campaign) notFound();

  const [records, applicants] = await Promise.all([
    getSeedingRecordsByCampaignId(campaign.id),
    getApplicantsByCampaignId(campaign.id),
  ]);

  const applicantMap = Object.fromEntries(applicants.map((a) => [a.id, a]));

  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100 p-4 sm:p-8 max-w-6xl mx-auto space-y-5 sm:space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5" />
            <span>{campaign.company_name}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-100 mt-1">
            {campaign.name} - 실시간 시딩 관리시트
          </h1>
          <p className="text-xs text-zinc-400">
            총 {records.length}명 진행 중인 인플루언서 배송/방문 단계 및 실시간 업로드 링크
          </p>
        </div>

        <a
          href={`/api/seeding-sheet/export?campaignId=${campaign.id}`}
          className="w-full sm:w-auto text-center justify-center px-4 py-2.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition border border-[#22242A]"
        >
          <Download className="w-3.5 h-3.5" />
          <span>시트 CSV 다운로드</span>
        </a>
      </div>

      {/* Mobile Cards (< sm) */}
      <div className="block sm:hidden space-y-3">
        {records.map((r) => {
          const app = applicantMap[r.applicant_id];
          return (
            <div
              key={r.id}
              className="p-4 rounded-2xl bg-[#131418] border border-[#22242A] space-y-2.5 shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-zinc-100">{app?.name || "-"}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[10px] font-semibold">
                  {r.progress_stage}
                </span>
              </div>

              <div className="text-xs space-y-1 text-zinc-400">
                <div className="flex items-center justify-between">
                  <span>SNS:</span>
                  <a
                    href={app?.sns_link || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[180px]"
                  >
                    <span>{app?.sns_link}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
                <div className="flex items-center justify-between">
                  <span>마감일:</span>
                  <span className="font-mono text-zinc-200">{r.upload_deadline || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>게시물:</span>
                  {r.upload_link ? (
                    <a
                      href={r.upload_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      <span>보기</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-zinc-600">-</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table (sm+) */}
      <div className="hidden sm:block p-6 rounded-3xl bg-[#131418] border border-[#22242A] shadow-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#090A0C] text-zinc-400 border-b border-[#22242A]">
            <tr>
              <th className="p-3.5">인플루언서</th>
              <th className="p-3.5">SNS 계정</th>
              <th className="p-3.5">진행 단계</th>
              <th className="p-3.5">업로드 마감일</th>
              <th className="p-3.5">게시물 링크</th>
              <th className="p-3.5">조회수 / 인게이지먼트</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#22242A] text-zinc-300">
            {records.map((r) => {
              const app = applicantMap[r.applicant_id];
              return (
                <tr key={r.id} className="hover:bg-[#181A20] transition">
                  <td className="p-3.5 font-bold text-zinc-100">{app?.name || "-"}</td>
                  <td className="p-3.5">
                    <a
                      href={app?.sns_link || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[140px]"
                    >
                      <span>{app?.sns_link}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </td>
                  <td className="p-3.5">
                    <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-semibold">
                      {r.progress_stage}
                    </span>
                  </td>
                  <td className="p-3.5 font-mono text-zinc-300">
                    {r.upload_deadline || "-"}
                  </td>
                  <td className="p-3.5">
                    {r.upload_link ? (
                      <a
                        href={r.upload_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline inline-flex items-center gap-1"
                      >
                        <span>게시물 보기</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                  <td className="p-3.5 text-zinc-300">
                    {r.views.toLocaleString()}회 / {r.engagement.toLocaleString()}개
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}