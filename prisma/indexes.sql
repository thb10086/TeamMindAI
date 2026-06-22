-- pgvector HNSW 索引（余弦距离 <=>）。
-- HNSW 要求向量列为固定维度（vector(1536)）；幂等创建，可重复执行。
-- 用法：npm run db:indexes
CREATE INDEX IF NOT EXISTS "Memory_embedding_hnsw"
  ON "Memory" USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "MemoryEntity_embedding_hnsw"
  ON "MemoryEntity" USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "MemoryCommunity_embedding_hnsw"
  ON "MemoryCommunity" USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_hnsw"
  ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops);
