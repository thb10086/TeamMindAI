import { requireFullUser, isCompanyAdmin } from "@/lib/access";
import { listCompanyUsers, listDepartments } from "@/lib/org";
// 组织管理（部门树 + 成员详情 + 弹框新增）。
import { OrgManager } from "./org-manager";

export const metadata = { title: "组织管理 · TeamMindAI" };

export default async function OrgPage() {
  const me = await requireFullUser();

  if (!isCompanyAdmin(me.systemRole)) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground">
        无权限：仅公司管理员可访问组织管理。
      </div>
    );
  }
  if (!me.companyId) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground">
        当前账号未归属任何公司，无法管理成员。
      </div>
    );
  }

  const [users, departments] = await Promise.all([
    listCompanyUsers(me.companyId),
    listDepartments(me.companyId),
  ]);

  return <OrgManager users={users} departments={departments} />;
}
