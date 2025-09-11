import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | CredentiVault",
  description: "Sign in to your CredentiVault account to manage and showcase your digital credentials securely.",
  openGraph: {
    title: "Sign In | CredentiVault",
    description: "Sign in to your CredentiVault account to manage and showcase your digital credentials securely.",
  },
  twitter: {
    title: "Sign In | CredentiVault",
    description: "Sign in to your CredentiVault account to manage and showcase your digital credentials securely.",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
