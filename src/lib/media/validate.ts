/**
 * Media file validation utilities
 * Validates file type, size, and determines media kind
 */

export type MediaKind = 'IMAGE' | 'VIDEO' | 'CAROUSEL'

export interface ValidationResult {
  valid: boolean
  error?: string
  kind: MediaKind
}

// Allowed MIME types and max sizes (in bytes)
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200 MB

/**
 * Validate a media file based on name, MIME type, and size
 * @param file - Object containing name, type (MIME), and size in bytes
 * @returns ValidationResult with validity, error message, and media kind
 */
export function validateMediaFile(file: {
  name: string
  type: string
  size: number
}): ValidationResult {
  const mimeType = file.type.toLowerCase()
  const size = file.size

  // Check if it's an image
  if (IMAGE_TYPES.includes(mimeType)) {
    if (size > MAX_IMAGE_SIZE) {
      return {
        valid: false,
        error: `Image file too large. Maximum size is ${MAX_IMAGE_SIZE / (1024 * 1024)}MB`,
        kind: 'IMAGE',
      }
    }
    return { valid: true, kind: 'IMAGE' }
  }

  // Check if it's a video
  if (VIDEO_TYPES.includes(mimeType)) {
    if (size > MAX_VIDEO_SIZE) {
      return {
        valid: false,
        error: `Video file too large. Maximum size is ${MAX_VIDEO_SIZE / (1024 * 1024)}MB`,
        kind: 'VIDEO',
      }
    }
    return { valid: true, kind: 'VIDEO' }
  }

  // Unsupported type
  return {
    valid: false,
    error: `Unsupported file type: ${file.type}. Supported: JPEG, PNG, WebP, GIF, MP4, MOV, WebM`,
    kind: 'IMAGE', // default fallback
  }
}

/**
 * Get the MediaKind from a MIME type
 */
export function getMediaKindFromMime(mimeType: string): MediaKind {
  const type = mimeType.toLowerCase()
  if (IMAGE_TYPES.includes(type)) return 'IMAGE'
  if (VIDEO_TYPES.includes(type)) return 'VIDEO'
  return 'IMAGE' // default
}

/**
 * Check if a MIME type is a supported image type
 */
export function isImageType(mimeType: string): boolean {
  return IMAGE_TYPES.includes(mimeType.toLowerCase())
}

/**
 * Check if a MIME type is a supported video type
 */
export function isVideoType(mimeType: string): boolean {
  return VIDEO_TYPES.includes(mimeType.toLowerCase())
}