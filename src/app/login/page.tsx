import { redirect } from "next/navigation";
import { Brain } from "lucide-react";

import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = { title: "登录 · TeamMindAI" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/10">
            <Brain className="size-6 text-primary" />
          </div>
          <CardTitle className="mt-2 text-xl">登录 TeamMindAI</CardTitle>
          <CardDescription>让想法变需求，让项目自动运转</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm />
          <p className="rounded-md bg-muted/50 px-3 py-2 text-center text-xs text-muted-foreground">
            演示账号：<span className="font-medium text-foreground">admin / admin123</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
