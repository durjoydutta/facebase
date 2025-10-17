import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import { fetchDashboardData } from "@/lib/dashboardData";

import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

const DashboardPage = async () => {
  const { profile } = await requireAdmin();
  const adminClient = getSupabaseAdminClient();
  const initialData = await fetchDashboardData(adminClient);

  return (
    <DashboardClient
      adminName={profile.name ?? profile.email}
      initialData={initialData}
    />
  );
};

export default DashboardPage;
