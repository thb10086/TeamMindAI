import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

/**
 * 对象存储（MinIO / S3 兼容）。集中封装，业务代码不直接拼 endpoint/签名。
 * 用于存放 AI 生成的二进制资产（如会议封面图）——网关图片以 base64 返回，
 * 不能热链，必须落对象存储后再经鉴权路由读取。
 */
let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint,
      forcePathStyle: true, // MinIO 必须用 path-style
      credentials: {
        accessKeyId: env.s3.accessKey,
        secretAccessKey: env.s3.secretKey,
      },
    });
  }
  return client;
}

let bucketEnsured = false;

/** 确保 bucket 存在（MinIO 不会自动建桶），进程内只检查一次。 */
async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const Bucket = env.s3.bucket;
  try {
    await s3().send(new HeadBucketCommand({ Bucket }));
  } catch {
    try {
      await s3().send(new CreateBucketCommand({ Bucket }));
    } catch (err) {
      const name = (err as { name?: string }).name;
      // 并发创建或已存在时忽略
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
        throw err;
      }
    }
  }
  bucketEnsured = true;
}

/** 上传对象，返回对象 key。 */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await ensureBucket();
  await s3().send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

/** 读取对象字节与 MIME（供鉴权路由代理输出，避免暴露存储 endpoint）。 */
export async function getObjectBytes(
  key: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const out = await s3().send(
    new GetObjectCommand({ Bucket: env.s3.bucket, Key: key })
  );
  if (!out.Body) throw new Error("对象内容为空。");
  const bytes = await out.Body.transformToByteArray();
  return { bytes, contentType: out.ContentType ?? "application/octet-stream" };
}

/**
 * 读取对象（支持 HTTP Range，用于音频拖动播放）。
 * 传入原始 Range 头（如 "bytes=0-"），返回字节及相应的 Content-Range/Length。
 */
export async function getObjectRange(
  key: string,
  range?: string
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
}> {
  const out = await s3().send(
    new GetObjectCommand({ Bucket: env.s3.bucket, Key: key, Range: range })
  );
  if (!out.Body) throw new Error("对象内容为空。");
  const bytes = await out.Body.transformToByteArray();
  return {
    bytes,
    contentType: out.ContentType ?? "application/octet-stream",
    contentLength: out.ContentLength,
    contentRange: out.ContentRange,
  };
}
