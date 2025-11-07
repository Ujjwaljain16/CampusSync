import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | CampusSync",
  description: "Sign in to your CampusSync account to manage your verified credentials and connect with career opportunities.",
  openGraph: {
    title: "Sign In | CampusSync",
    description: "Sign in to your CampusSync account to manage your verified credentials and connect with career opportunities.",
  },
  twitter: {
    title: "Sign In | CampusSync",
    description: "Sign in to your CampusSync account to manage your verified credentials and connect with career opportunities.",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
