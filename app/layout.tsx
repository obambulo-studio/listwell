import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { getToken } from "@/lib/auth-server";
import { ThemeBootstrapScript } from "@/lib/theme";

import "./beautifui/foundation.css";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  description:
    "Chat-first local and website SEO audit. Answer a few questions, get a basic report, then upgrade for fixes and automation.",
  title: {
    default: "Listwell",
    template: "%s · Listwell",
  },
};

const RootLayout = async ({ children }: { children: ReactNode }) => {
  let token: string | null = null;
  try {
    token = (await getToken()) ?? null;
  } catch {
    // Convex dev may not be running locally yet.
  }
  return (
    <html
      lang="en-AU"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeBootstrapScript />
      </head>
      <body>
        <ConvexClientProvider initialToken={token}>
          <AppShell>{children}</AppShell>
        </ConvexClientProvider>
      </body>
    </html>
  );
};

export default RootLayout;
