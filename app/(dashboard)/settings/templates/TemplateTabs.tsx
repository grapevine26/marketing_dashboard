"use client";

import { useState } from "react";
import { FileQuestion, Camera } from "lucide-react";

export type TemplateTabKey = "presurvey" | "sns";

/**
 * 사전조사 / SNS 사전설문 두 템플릿 편집기를 한 페이지에서 탭으로 전환한다.
 * 활성 탭 색은 각 모듈의 색(시딩=파랑, SNS=티얼)을 그대로 따른다.
 */
export default function TemplateTabs({
  initialTab,
  preSurvey,
  sns,
}: {
  initialTab: TemplateTabKey;
  preSurvey: React.ReactNode;
  sns: React.ReactNode;
}) {
  const [tab, setTab] = useState<TemplateTabKey>(initialTab);

  const tabBtn = (key: TemplateTabKey, icon: React.ReactNode, label: string, activeCls: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
        tab === key ? activeCls : "text-text-sub hover:text-text"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 border-b border-border pb-1 overflow-x-auto">
        {tabBtn(
          "presurvey",
          <FileQuestion className="w-3.5 h-3.5" />,
          "사전조사 템플릿",
          "bg-blue-500/15 text-blue-400 border border-blue-500/30"
        )}
        {tabBtn(
          "sns",
          <Camera className="w-3.5 h-3.5" />,
          "SNS 사전설문 템플릿",
          "bg-accent2/15 text-accent2 border border-accent2/30"
        )}
      </div>

      {tab === "presurvey" ? preSurvey : sns}
    </div>
  );
}
