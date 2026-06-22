import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TeamMindAI · AI 企业大脑平台",
  description:
    "让想法变需求，让项目自动运转。面向初创团队的多 Agent 智能协作中台：AI 需求澄清、任务拆解、看板推进、通知提醒、项目记忆沉淀。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={cn(
          inter.className,
          "min-h-screen bg-background text-foreground antialiased"
        )}
      >
        {children}
      </body>
    </html>
  );
}
