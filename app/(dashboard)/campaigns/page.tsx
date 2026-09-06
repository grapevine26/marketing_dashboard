import { getCampaigns } from "@/lib/db";
import CampaignsListClient from "./CampaignsListClient";

export const revalidate = 0;

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();
  return <CampaignsListClient initialCampaigns={campaigns} />;
}

