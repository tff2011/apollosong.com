import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";

const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
    },
});

// Helper to normalize domain (strip protocol if present)
const normalizeDomain = (domain: string) => {
    return domain.replace(/^https?:\/\//, "");
};

export const StorageService = {
    /**
     * Generates a presigned URL for uploading a file directly from the client.
     * @param key The file path/name
     * @param contentType MIME type
     * @returns URL and fields
     */
    async getUploadUrl(key: string, contentType: string) {
        if (!env.R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME not configured");

        const command = new PutObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
            ContentType: contentType,
        });

        // 1 hour expiration
        return getSignedUrl(S3, command, { expiresIn: 3600 });
    },

    /**
     * Generates a signed URL for reading a private file.
     * @param key The file path/name
     * @returns Presigned URL
     */
    async getReadUrl(key: string) {
        if (!env.R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME not configured");

        // If we have a public domain configured, use that instead of signed S3 URLs for public assets
        // This assumes the bucket is public or the domain is handled by Cloudflare
        if (env.R2_PUBLIC_DOMAIN) {
            return `https://${normalizeDomain(env.R2_PUBLIC_DOMAIN)}/${key}`;
        }

    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    });

    return getSignedUrl(S3, command, { expiresIn: 3600 });
  },

  /**
   * Deletes a file from storage.
   */
  async deleteFile(key: string) {
    if (!env.R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME not configured");

    const command = new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    });

    return S3.send(command);
  },

  /**
   * Uploads a buffer directly to R2.
   * @param key The file path/name
   * @param buffer The file content as Buffer
   * @param contentType MIME type
   * @returns The public URL of the uploaded file
   */
  async uploadBuffer(key: string, buffer: Buffer, contentType: string) {
    if (!env.R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME not configured");

    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await S3.send(command);

    // Return public URL
    if (env.R2_PUBLIC_DOMAIN) {
      return `https://${normalizeDomain(env.R2_PUBLIC_DOMAIN)}/${key}`;
    }

    // Fallback to signed URL
    return this.getReadUrl(key);
  },
};
