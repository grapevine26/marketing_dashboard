import { getSnsAccounts } from "@/lib/db";
import SnsAccountsListClient from "./SnsAccountsListClient";

export const revalidate = 0;

export default async function SnsAccountsListPage() {
  const accounts = await getSnsAccounts();
  return <SnsAccountsListClient initialAccounts={accounts} />;
}