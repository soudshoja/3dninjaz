import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a 3D Ninjaz account",
  // Auth surface — keep out of the search index to reduce phishing surface.
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <RegisterForm />;
}
