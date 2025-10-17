import { requireAdmin } from "@/lib/auth";

import RegisterClient from "./register-client";

export const dynamic = "force-dynamic";

interface RegisterPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

const RegisterPage = async ({ searchParams }: RegisterPageProps) => {
  const { profile } = await requireAdmin();

  const prefillName =
    typeof searchParams?.prefillName === "string"
      ? searchParams.prefillName
      : undefined;
  const prefillEmail =
    typeof searchParams?.prefillEmail === "string"
      ? searchParams.prefillEmail
      : undefined;

  return (
    <RegisterClient
      adminName={profile.name ?? profile.email}
      initialName={prefillName}
      initialEmail={prefillEmail}
    />
  );
};

export default RegisterPage;
