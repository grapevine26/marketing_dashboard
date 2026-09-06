import { notFound } from "next/navigation";
import { getCampaignById, getCampaignFormConfig } from "@/lib/db";
import ApplyFormEditor from "./ApplyFormEditor";

export const revalidate = 0;

export default async function ApplyFormSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const formConfig = await getCampaignFormConfig(id);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <ApplyFormEditor
        campaign={campaign}
        initialConfig={formConfig}
        applyPath={`/apply/${campaign.apply_form_token}`}
      />
    </div>
  );
}
