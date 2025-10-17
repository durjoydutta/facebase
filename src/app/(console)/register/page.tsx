import { requireAdmin } from "@/lib/auth";

import RegisterClient from "./register-client";

export const dynamic = "force-dynamic";

const RegisterPage = async () => {
  const { profile } = await requireAdmin();

  return <RegisterClient adminName={profile.name ?? profile.email} />;
};

export default RegisterPage;
