import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your 3D Ninjaz account",
  // Auth surface — keep out of the search index to reduce phishing surface.
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginForm />;
}
