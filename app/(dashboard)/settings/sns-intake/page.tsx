import { getSnsIntakeTemplate } from "@/lib/db";
import SnsIntakeSettingsClient from "./SnsIntakeSettingsClient";
import { Sliders } from "lucide-react";

export const revalidate = 0;

export default async function SnsIntakeSettingsPage() {
  const template = await getSnsIntakeTemplate();

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight flex items-center gap-2">
          <Sliders className="w-6 h-6 text-accent2" />
          <span>SNS 사전설문 기본 템플릿 설정</span>
        </h1>
        <p className="text-xs sm:text-sm text-text-sub">
          신규 SNS 계정 등록 시 모든 광고주에게 기본 제공되는 사전설문 질문 항목과 가이드라인을 관리합니다.
        </p>
      </div>

      <SnsIntakeSettingsClient initialTemplate={template} />
    </div>
  );
}