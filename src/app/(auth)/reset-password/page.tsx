import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password | 3D Ninjaz",
  description: "Choose a new password",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
