import { getPreSurveyTemplate } from "@/lib/db";
import PreSurveyTemplateEditor from "./PreSurveyTemplateEditor";

export const revalidate = 0;

export default async function PreSurveySettingsPage() {
  const template = await getPreSurveyTemplate();
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">사전조사 템플릿 설정</h1>
        <p className="text-sm text-slate-400">
          신규 캠페인 생성 시 모든 광고주에게 공통으로 질의할 사전조사 질문 항목을 관리합니다.
        </p>
      </div>
      <PreSurveyTemplateEditor initialTemplate={template} />
    </div>
  );
}