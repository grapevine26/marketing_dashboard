import { notFound } from "next/navigation";
import {
  getSnsAccountById,
  getSnsContentsByAccountId,
  getSnsIntakeResponse,
  getSnsPlan,
  getPptTemplates,
} from "@/lib/db";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import SnsAccountDetailClient from "./SnsAccountDetailClient";

export const revalidate = 0;

export default async function SnsAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getSnsAccountById(id);
  if (!account) notFound();

  const [contents, intakeResponse, plan, templates] = await Promise.all([
    getSnsContentsByAccountId(account.id),
    getSnsIntakeResponse(account.id),
    getSnsPlan(account.id),
    getPptTemplates("sns"),
  ]);

  return (
    <div className="space-y-4 max-w-6xl mx-auto font-sans">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href="/sns" className="hover:text-sky-400 flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>SNS 계정 목록</span>
        </Link>
        <span>/</span>
        <span className="text-zinc-200">{account.company_name} (@{account.handle})</span>
      </div>

      <SnsAccountDetailClient
        account={account}
        initialContents={contents}
        intakeResponse={intakeResponse}
        plan={plan}
        templates={templates}
      />
    </div>
  );
}