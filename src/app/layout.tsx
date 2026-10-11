import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CookVision",
  description: "調理風景を撮るだけで、AIがレシピにしてくれるアプリ",
  appleWebApp: { capable: true, title: "CookVision", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#d9472b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
