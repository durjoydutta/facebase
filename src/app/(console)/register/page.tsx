import { requireAdmin } from "@/lib/auth";

import RegisterClient from "./register-client";

export const dynamic = "force-dynamic";

interface RegisterPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const RegisterPage = async ({ searchParams }: RegisterPageProps) => {
  const { profile } = await requireAdmin();
  const resolvedParams = searchParams ? await searchParams : {};

  const prefillName =
    typeof resolvedParams.prefillName === "string"
      ? resolvedParams.prefillName
      : undefined;
  const prefillEmail =
    typeof resolvedParams.prefillEmail === "string"
      ? resolvedParams.prefillEmail
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
