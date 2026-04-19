import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create Account | 3D Ninjaz",
  description: "Create a 3D Ninjaz account",
};

export default function RegisterPage() {
  return <RegisterForm />;
}
