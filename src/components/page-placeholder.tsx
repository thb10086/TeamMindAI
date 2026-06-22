import { Construction } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PagePlaceholder({
  title,
  description,
  features = [],
}: {
  title: string;
  description: string;
  features?: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <Construction className="size-5" />
            <CardTitle>本模块开发中</CardTitle>
          </div>
          <CardDescription>
            MVP 已规划，将按《产品原型文档》落地优先级逐步实现。
          </CardDescription>
        </CardHeader>
        {features.length > 0 && (
          <CardContent>
            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-primary" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
