import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Choose a new password",
  // Auth surface — keep out of the search index.
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
