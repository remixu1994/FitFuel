import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitFuel · 今日饮食",
  description: "AI 驱动的个人营养记录与饮食管理"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
