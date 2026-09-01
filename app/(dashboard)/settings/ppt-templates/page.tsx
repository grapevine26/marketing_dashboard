import { getPptTemplates } from "@/lib/db";
import PptTemplatesClient from "./PptTemplatesClient";
import { Presentation, FileCode } from "lucide-react";

export const revalidate = 0;

export default async function PptTemplatesSettingsPage() {
  const templates = await getPptTemplates();

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <Presentation className="w-6 h-6 text-amber-400" />
          <span>공용 PPT 템플릿 관리</span>
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400">
          인플루언서 행사 운영안(B) 및 SNS 채널 운영 제안서(C)에서 사용되는 파워포인트(.pptx) 양식을 등록하고 플레이스홀더를 관리합니다.
        </p>
      </div>

      <PptTemplatesClient initialTemplates={templates} />
    </div>
  );
}