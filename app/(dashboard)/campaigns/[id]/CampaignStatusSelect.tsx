"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignStatus, CAMPAIGN_STATUS_LABELS } from "@/lib/db/types";
import { updateCampaignStatusAction } from "./actions";
import { Loader2 } from "lucide-react";

const ORDER: CampaignStatus[] = ["draft", "recruiting", "selecting", "seeding", "reporting", "completed"];

export default function CampaignStatusSelect({
  campaignId,
  initialStatus,
}: {
  campaignId: string;
  initialStatus: CampaignStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<CampaignStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (next: CampaignStatus) => {
    const prev = status;
    setStatus(next);
    setSaving(true);
    setError(null);
    const res = await updateCampaignStatusAction(campaignId, next);
    setSaving(false);
    if (!res.ok) {
      setStatus(prev);
      setError(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="text-[11px] text-zinc-500">캠페인 상태</label>
      <div className="flex items-center gap-2">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
        <select
          value={status}
          disabled={saving}
          onChange={(e) => handleChange(e.target.value as CampaignStatus)}
          className="px-3 py-1.5 rounded-lg bg-[#090A0C] border border-[#22242A] text-blue-400 text-xs font-bold focus:outline-none focus:border-blue-500"
        >
          {ORDER.map((s) => (
            <option key={s} value={s}>
              {CAMPAIGN_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </div>
  );
}
