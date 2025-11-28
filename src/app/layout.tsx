import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { cn } from "@/lib/utils";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "facebase",
    template: "%s | facebase",
  },
  description:
    "facebase is the centralized console for biometric access management.",
  icons: {
    icon: "/logo.png",
  },
};

const RootLayout = ({ children }: Readonly<{ children: ReactNode }>) => (
  <html lang="en" suppressHydrationWarning>
    <body
      className={cn(
        "min-h-screen bg-background font-sans text-foreground antialiased",
        geistSans.variable,
        geistMono.variable
      )}>
      {children}
    </body>
  </html>
);

export default RootLayout;
