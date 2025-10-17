import type { ReactNode } from "react";

import AdminHeader from "@/components/layout/AdminHeader";
import { requireAdmin } from "@/lib/auth";

const ConsoleLayout = async ({ children }: { children: ReactNode }) => {
  const { profile } = await requireAdmin();

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader profile={profile} />
      <div className="pb-20 pt-6">{children}</div>
    </div>
  );
};

export default ConsoleLayout;
