"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReportAction } from "./actions";
import { Plus, Loader2 } from "lucide-react";

export default function CreateReportButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await createReportAction(campaignId);
      router.push(`/campaigns/${campaignId}/reports/${res.report.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleCreate}
      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50 inline-flex items-center gap-1.5"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
      <span>새 결과보고서 생성</span>
    </button>
  );
}