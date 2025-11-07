import type { Metadata } from "next";
import { Inter, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { OrganizationProvider } from "@/contexts/OrganizationContext";

// Font configurations
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Global metadata for the application
export const metadata: Metadata = {
  title: {
    default: "CredentiVault - Secure Digital Credentials Platform",
    template: "%s | CredentiVault",
  },
  description: "Secure, verify, and showcase your academic achievements with blockchain-powered digital credentials. Build your professional portfolio with verified certificates.",
  keywords: ["digital credentials", "blockchain", "academic certificates", "student portfolio", "credential verification", "education technology"],
  authors: [{ name: "CredentiVault Team" }],
  creator: "CredentiVault",
  publisher: "CredentiVault",
  metadataBase: new URL("https://credentivault.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://credentivault.com",
    title: "CredentiVault - Secure Digital Credentials Platform",
    description: "Secure, verify, and showcase your academic achievements with blockchain-powered digital credentials.",
    siteName: "CredentiVault",
  },
  twitter: {
    card: "summary_large_image",
    title: "CredentiVault - Secure Digital Credentials Platform",
    description: "Secure, verify, and showcase your academic achievements with blockchain-powered digital credentials.",
    creator: "@credentivault",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "google-site-verification-code",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistSans.variable} ${geistMono.variable}`}>
      <head>
  <link rel="icon" href="/logo-clean.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#667eea" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
      <body className="antialiased font-sans min-h-screen">
        <OrganizationProvider>
          {children}
        </OrganizationProvider>
      </body>
    </html>
  );
}
