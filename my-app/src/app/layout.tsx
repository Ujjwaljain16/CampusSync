import type { Metadata } from "next";
import { Inter, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ui/toast";

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
    default: "CampusSync - Where Credentials Meet Career Opportunities",
    template: "%s | CampusSync",
  },
  description: "Next-Generation Multi-Tenant SaaS for Seamless Campus Recruitment and Credential Verification. Streamlined certificate verification and credential management using OCR technology and W3C standards.",
  keywords: ["digital credentials", "campus recruitment", "credential verification", "OCR technology", "W3C verifiable credentials", "education technology", "multi-tenant SaaS"],
  authors: [{ name: "CampusSync Team" }],
  creator: "CampusSync",
  publisher: "CampusSync",
  metadataBase: new URL("https://campusync1.vercel.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://campusync1.vercel.app",
    title: "CampusSync - Where Credentials Meet Career Opportunities",
    description: "Next-Generation Multi-Tenant SaaS for Seamless Campus Recruitment and Credential Verification using OCR technology and W3C standards.",
    siteName: "CampusSync",
  },
  twitter: {
    card: "summary_large_image",
    title: "CampusSync - Where Credentials Meet Career Opportunities",
    description: "Next-Generation Multi-Tenant SaaS for Seamless Campus Recruitment and Credential Verification using OCR technology and W3C standards.",
    creator: "@campussync",
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
        <ErrorBoundary>
          <ToastProvider>
            <OrganizationProvider>
              {children}
            </OrganizationProvider>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
