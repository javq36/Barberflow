import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/components/providers/store-provider";
import { Texts } from "@/lib/content/texts";
import { AppToastProvider } from "@/lib/toast/toast-provider";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: Texts.Layout.Metadata.Title,
  description: Texts.Layout.Metadata.Description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="premium-dark">
      <body
        className={`${outfit.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <StoreProvider>
          <AppToastProvider>{children}</AppToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
