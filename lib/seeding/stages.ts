import { CampaignType, ProgressStage } from "@/lib/db/types";

export const SHIPPING_STAGES: ProgressStage[] = [
  "선정완료",
  "발송완료",
  "가이드전달완료",
  "수령완료",
  "업로드완료",
];

export const VISIT_STAGES: ProgressStage[] = [
  "선정완료",
  "확정완료",
  "가이드전달완료",
  "방문완료",
  "업로드완료",
];

export function getStagesForType(type: CampaignType): ProgressStage[] {
  return type === "shipping" ? SHIPPING_STAGES : VISIT_STAGES;
}
