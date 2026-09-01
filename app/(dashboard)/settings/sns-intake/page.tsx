import { getSnsIntakeTemplate } from "@/lib/db";
import SnsIntakeSettingsClient from "./SnsIntakeSettingsClient";
import { Sliders, Camera } from "lucide-react";

export const revalidate = 0;

export default async function SnsIntakeSettingsPage() {
  const template = await getSnsIntakeTemplate();

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <Sliders className="w-6 h-6 text-sky-400" />
          <span>SNS 사전설문 기본 질문틀 관리</span>
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400">
          모든 SNS 대행 계정의 광고주 사전설문에 공통으로 적용되는 기본 질문 항목을 수정합니다.
        </p>
      </div>

      <SnsIntakeSettingsClient initialTemplate={template} />
    </div>
  );
}