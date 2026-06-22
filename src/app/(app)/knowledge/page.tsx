import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata = { title: "知识库 · TeamMindAI" };

export default function KnowledgePage() {
  return (
    <PagePlaceholder
      title="知识库"
      description="管理企业与项目知识，支持文档解析、向量化入库与问答检索。"
      features={[
        "文档上传与 AI 解析",
        "自动摘要与分类",
        "分块向量化（pgvector）",
        "FAQ 生成",
        "问答式检索（引用来源）",
        "项目知识自动归档",
      ]}
    />
  );
}
