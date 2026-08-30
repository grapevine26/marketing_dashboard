import { notFound } from "next/navigation";
import { getCampaignByToken, getApplicantsByCampaignId } from "@/lib/db";
import { Building2, ExternalLink, Users, Download } from "lucide-react";

export const revalidate = 0;

export default async function PublicApplicantsSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const campaign = await getCampaignByToken("applicants_share", token);
  if (!campaign) notFound();

  const applicants = await getApplicantsByCampaignId(campaign.id);
  const selectedCount = applicants.filter((a) => a.status === "selected").length;
  const reservedCount = applicants.filter((a) => a.status === "reserved").length;

  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100 p-6 sm:p-10 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5" />
            <span>{campaign.company_name}</span>
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-100 mt-1">
            {campaign.name} - 지원자 심사 및 선정 현황
          </h1>
          <p className="text-xs text-zinc-400">
            총 {applicants.length}명의 지원자 중 최종선정 {selectedCount}명 / 예비선정 {reservedCount}명
          </p>
        </div>

        <a
          href={`/api/applicants/export?campaignId=${campaign.id}`}
          className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition border border-[#22242A]"
        >
          <Download className="w-3.5 h-3.5" />
          <span>명단 CSV 다운로드</span>
        </a>
      </div>

      <div className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] shadow-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#090A0C] text-zinc-400 border-b border-[#22242A]">
            <tr>
              <th className="p-3.5">지원자</th>
              <th className="p-3.5">SNS 링크</th>
              <th className="p-3.5">국적</th>
              <th className="p-3.5">상태</th>
              <th className="p-3.5">지원 일자</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#22242A] text-zinc-300">
            {applicants.map((a) => (
              <tr key={a.id} className="hover:bg-[#181A20] transition">
                <td className="p-3.5 font-bold text-zinc-100">{a.name}</td>
                <td className="p-3.5">
                  <a
                    href={a.sns_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[150px]"
                  >
                    <span>{a.sns_link}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </td>
                <td className="p-3.5">{a.nationality}</td>
                <td className="p-3.5">
                  {a.status === "selected" && (
                    <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold text-[11px]">
                      최종선정 ✓
                    </span>
                  )}
                  {a.status === "reserved" && (
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold">
                      예비선정
                    </span>
                  )}
                  {a.status === "applied" && (
                    <span className="px-2 py-0.5 rounded-full bg-[#181A20] text-zinc-500 text-[11px]">
                      미선정
                    </span>
                  )}
                </td>
                <td className="p-3.5 font-mono text-zinc-500 text-[11px]">
                  {new Date(a.applied_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}