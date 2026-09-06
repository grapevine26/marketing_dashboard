import { getPptTemplates } from "@/lib/db";
import PptTemplatesClient from "./PptTemplatesClient";
import { Presentation } from "lucide-react";

export const revalidate = 0;

export default async function PptTemplatesSettingsPage() {
  const templates = await getPptTemplates();
  // base64 파일 본문은 클라이언트에 내려보내지 않는다 (수 MB가 될 수 있음)
  const light = templates.map((t) => ({ ...t, file_data: undefined }));

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight flex items-center gap-2">
          <Presentation className="w-6 h-6 text-amber-400" />
          <span>공용 PPT 템플릿 관리</span>
        </h1>
        <p className="text-xs sm:text-sm text-text-sub">
          인플루언서 행사 운영안 및 SNS 채널 운영 제안서에서 사용되는 파워포인트(.pptx) 양식을 등록하고 치환 항목을 관리합니다.
        </p>
      </div>

      <PptTemplatesClient initialTemplates={light} />
    </div>
  );
}
