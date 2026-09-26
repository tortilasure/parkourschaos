import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parkour Chaos — 3D parkour party for up to 12 players",
  description: "Chaotic 3D parkour: random courses, multiplayer up to 12 players, Solo, Time Attack, shop, skins and achievements.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1b1440",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Script src="https://sdk.crazygames.com/crazygames-sdk-v2.js" strategy="afterInteractive" />
        {children}
      </body>
    </html>
  );
}
