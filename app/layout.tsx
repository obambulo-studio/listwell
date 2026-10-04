import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { ListwellWebMcp } from "@/components/listwell-web-mcp";
import { Toaster } from "@/components/ui/sonner";
import { getToken } from "@/lib/auth-server";
import { listwellSiteUrl } from "@/lib/site-metadata";
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
    "Local and website SEO audit for businesses. Answer a few questions, get a basic report, then upgrade for fix steps and automation.",
  icons: {
    apple: [{ type: "image/svg+xml", url: "/apple-touch-icon.svg" }],
    icon: [{ type: "image/svg+xml", url: "/favicon.svg" }],
  },
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
  const origin = listwellSiteUrl();
  return (
    <html
      lang="en-AU"
      className={`${geistSans.variable} ${geistMono.variable} light`}
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <head>
        <ThemeBootstrapScript />
        <link
          rel="describedby"
          href={`${origin}/llms.txt`}
          type="text/markdown"
        />
        <link
          rel="service-doc"
          href={`${origin}/llms.txt`}
          type="text/markdown"
        />
        <link
          rel="ard"
          href={`${origin}/.well-known/ai-catalog.json`}
          type="application/json"
        />
        <link
          rel="service-desc"
          href={`${origin}/.well-known/api-catalog`}
          type="application/linkset+json"
        />
      </head>
      <body>
        <ConvexClientProvider initialToken={token}>
          <ListwellWebMcp />
          <AppShell>{children}</AppShell>
          <Toaster position="top-center" richColors closeButton />
        </ConvexClientProvider>
      </body>
    </html>
  );
};

export default RootLayout;
