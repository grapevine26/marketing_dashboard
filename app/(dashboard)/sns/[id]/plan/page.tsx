import { notFound } from "next/navigation";
import {
  getSnsAccountById,
  getSnsPlan,
  getSnsIntakeResponse,
  getPptTemplates,
} from "@/lib/db";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import SnsPlanEditorClient from "./SnsPlanEditorClient";

export const revalidate = 0;

export default async function SnsPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getSnsAccountById(id);
  if (!account) notFound();

  const [plan, intake, templates] = await Promise.all([
    getSnsPlan(account.id),
    getSnsIntakeResponse(account.id),
    getPptTemplates("sns"),
  ]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto font-sans">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href={`/sns/${account.id}`} className="hover:text-sky-400 flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>{account.company_name} 계정 허브</span>
        </Link>
        <span>/</span>
        <span className="text-zinc-200">SNS 운영 제안서 (운영안)</span>
      </div>

      <SnsPlanEditorClient
        account={account}
        initialPlan={plan}
        intakeResponse={intake}
        templates={templates}
      />
    </div>
  );
}