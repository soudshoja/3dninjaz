import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In | 3D Ninjaz",
  description: "Sign in to your 3D Ninjaz account",
};

export default function LoginPage() {
  return <LoginForm />;
}
