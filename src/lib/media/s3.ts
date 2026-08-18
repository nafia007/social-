import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

/**
 * S3Service handles all S3 operations for media uploads
 * Uses AWS SDK v3 with presigned URLs for direct browser uploads
 */

const REGION = process.env.AWS_REGION
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY
const BUCKET_NAME = process.env.S3_BUCKET_NAME
const CDN_URL = process.env.S3_CDN_URL

let _s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!REGION || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET_NAME) {
    throw new Error('Missing required AWS S3 environment variables')
  }
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
    })
  }
  return _s3Client
}

function assertBucket(): string {
  if (!BUCKET_NAME) throw new Error('Missing required AWS S3 environment variable: S3_BUCKET_NAME')
  return BUCKET_NAME
}

/**
 * Build the public URL for an S3 object
 * Uses CDN URL if configured, otherwise standard S3 URL
 */
export function buildPublicUrl(key: string): string {
  if (CDN_URL) {
    // Ensure CDN_URL doesn't end with slash and key doesn't start with slash
    const base = CDN_URL.replace(/\/+$/, '')
    const cleanKey = key.replace(/^\/+/, '')
    return `${base}/${cleanKey}`
  }
  const region = REGION ?? 'us-east-1'
  const bucket = assertBucket()
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

/**
 * Sanitize filename for safe S3 key usage
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100)
}

export class S3Service {
  /**
   * Upload a buffer directly to S3
   */
  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string
  ): Promise<{ s3Key: string; url: string }> {
    const command = new PutObjectCommand({
      Bucket: assertBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })

    await getS3Client().send(command)

    return {
      s3Key: key,
      url: buildPublicUrl(key),
    }
  }

  /**
   * Generate a presigned URL for direct browser upload
   * @param key - S3 object key
   * @param contentType - MIME type of the file
   * @param expiresInSeconds - URL expiration time (default 10 minutes)
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 600
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: assertBucket(),
      Key: key,
      ContentType: contentType,
    })

    return getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds })
  }

  /**
   * Generate a presigned URL for downloading/viewing an object
   * @param key - S3 object key
   * @param expiresInSeconds - URL expiration time (default 1 hour)
   */
  async getPresignedDownloadUrl(
    key: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const command = new GetObjectCommand({
      Bucket: assertBucket(),
      Key: key,
    })

    return getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds })
  }

  /**
   * Delete an object from S3
   */
  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: assertBucket(),
      Key: key,
    })

    await getS3Client().send(command)
  }

  /**
   * Generate a unique S3 key for a user's media file
   * Format: media/{userId}/{uuid}-{sanitizedFilename}
   */
  generateKey(userId: string, filename: string): string {
    const uuid = randomUUID()
    const sanitized = sanitizeFilename(filename)
    return `media/${userId}/${uuid}-${sanitized}`
  }
}

// Singleton instance
export const s3Service = new S3Service()