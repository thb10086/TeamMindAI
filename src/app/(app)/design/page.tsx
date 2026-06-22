import { redirect } from "next/navigation";

// 界面设计已收敛到「项目空间 → 界面设计」二级视图，这里仅做兼容跳转。
export default function DesignIndexRedirect() {
  redirect("/project");
}
