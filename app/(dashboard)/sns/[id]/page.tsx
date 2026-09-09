import { notFound } from "next/navigation";
import {
  getSnsAccountById,
  getSnsContentsByAccountId,
  getSnsIntakeResponse,
  getSnsIntakeTemplate,
} from "@/lib/db";
import { toKstDateString } from "@/lib/seeding/dday";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import SnsAccountDetailClient from "./SnsAccountDetailClient";
import { isBlobBackend } from "@/lib/db/storage";

export const revalidate = 0;

export default async function SnsAccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; contentId?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const initialTab = sp?.tab === "list" || sp?.tab === "intake" ? sp.tab : "calendar";
  const account = await getSnsAccountById(id);
  if (!account) notFound();

  const [contents, intakeResponse, intakeTemplate] = await Promise.all([
    getSnsContentsByAccountId(account.id),
    getSnsIntakeResponse(account.id),
    getSnsIntakeTemplate(),
  ]);

  return (
    <div className="space-y-4 max-w-6xl mx-auto font-sans">
      <div className="flex items-center gap-2 text-xs text-text-sub">
        <Link href="/sns" className="hover:text-accent2 flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>SNS 계정 목록</span>
        </Link>
        <span>/</span>
        <span className="text-text">{account.company_name} (@{account.handle})</span>
      </div>

      <SnsAccountDetailClient
        account={account}
        initialContents={contents}
        intakeResponse={intakeResponse}
        intakeQuestions={intakeTemplate.questions}
        todayKst={toKstDateString()}
        clientUpload={isBlobBackend()}
        initialTab={initialTab}
        highlightContentId={sp?.contentId}
      />
    </div>
  );
}
