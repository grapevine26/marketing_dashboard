import { getPreSurveyTemplate } from "@/lib/db";
import PreSurveyTemplateEditor from "./PreSurveyTemplateEditor";
import { Sliders, Sparkles } from "lucide-react";

export const revalidate = 0;

export default async function PreSurveySettingsPage() {
  const template = await getPreSurveyTemplate();
  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2.5">
            <Sliders className="w-6 h-6 text-blue-400" />
            <span>사전조사 기본 템플릿 설정</span>
          </h1>
          <p className="text-sm text-zinc-400">
            신규 캠페인 생성 시 모든 광고주에게 기본 제공되는 핵심 사전조사 질문 항목과 가이드라인을 관리합니다.
          </p>
        </div>
      </div>

      <PreSurveyTemplateEditor initialTemplate={template} />
    </div>
  );
}