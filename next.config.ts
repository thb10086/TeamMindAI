import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bullmq", "ioredis", "bcryptjs", "pdf-parse", "mammoth"],
  // 开发期允许来自本机其它 host/port 的请求（如 IDE 内嵌预览代理），
  // 消除 /_next/* 跨源告警。
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
