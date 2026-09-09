import { getPreSurveyTemplate, getSnsIntakeTemplate } from "@/lib/db";
import PreSurveyTemplateEditor from "../pre-survey/PreSurveyTemplateEditor";
import SnsIntakeSettingsClient from "../sns-intake/SnsIntakeSettingsClient";
import TemplateTabs from "./TemplateTabs";
import { Sliders, Info } from "lucide-react";

export const revalidate = 0;

/**
 * 사전조사 / SNS 사전설문 기본 템플릿을 한 페이지에서 탭으로 관리한다.
 * `?tab=sns` 로 SNS 탭을 바로 열 수 있다 (가이드에서 직접 링크).
 */
export default async function TemplateSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const [preSurveyTemplate, snsIntakeTemplate] = await Promise.all([
    getPreSurveyTemplate(),
    getSnsIntakeTemplate(),
  ]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2.5">
          <Sliders className="w-6 h-6 text-text-sub" />
          <span>템플릿 설정</span>
        </h1>
        <p className="text-sm text-text-sub">
          신규 캠페인과 SNS 계정에 기본 제공되는 사전조사·사전설문 질문 항목과 가이드라인을 관리합니다.
        </p>
      </div>

      <div className="bg-bg-sub/60 border border-border rounded-xl p-4 flex items-start gap-3 text-xs text-text-sub leading-relaxed">
        <Info className="w-4 h-4 text-accent2 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-text">공통 기본 템플릿과 개별 캠페인·계정별 맞춤 설정 안내</p>
          <p>
            여기서 설정한 문항은 모든 캠페인과 SNS 계정의 기본 문항으로 사용됩니다.
            특정 캠페인이나 SNS 계정에만 필요한 질문이 있다면, 각 캠페인 상세의 [사전조사 - 문항 편집] 탭이나 SNS 계정 상세의 [사전설문 - 문항 편집] 탭에서 독립적으로 문항을 추가·삭제·수정할 수 있습니다.
          </p>
        </div>
      </div>

      <TemplateTabs
        initialTab={tab === "sns" ? "sns" : "presurvey"}
        preSurvey={<PreSurveyTemplateEditor initialTemplate={preSurveyTemplate} />}
        sns={<SnsIntakeSettingsClient initialTemplate={snsIntakeTemplate} />}
      />
    </div>
  );
}
