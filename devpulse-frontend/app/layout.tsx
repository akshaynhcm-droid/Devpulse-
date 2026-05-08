import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "../components/AuthProvider";
import { CookieConsent } from "../components/CookieConsent";
import { SentryErrorBoundary } from "../components/ErrorBoundary";
import { TRPCProvider } from "@/lib/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DevPulse Command Center",
  description: "Real-time AI Agent Cost Monitoring & Security",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TRPCProvider>
          <AuthProvider>
            <SentryErrorBoundary>{children}</SentryErrorBoundary>
            <CookieConsent />
          </AuthProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
