/**
 * Utility functions for working with video messages in UnifiedAI
 * 
 * This module provides helper functions to simplify video file handling
 * and message creation for use with Google Gemini models.
 */

import fs from 'fs';
import path from 'path';
import { BaseVideoMessage } from './index';

/**
 * Supported video MIME types for Google Gemini
 */
export const SUPPORTED_VIDEO_FORMATS = {
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  mpg: 'video/mpg',
  mov: 'video/mov',
  avi: 'video/avi',
  flv: 'video/x-flv',
  webm: 'video/webm',
  wmv: 'video/wmv',
  '3gp': 'video/3gpp',
  '3gpp': 'video/3gpp'
} as const;

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase().replace('.', '');
  return SUPPORTED_VIDEO_FORMATS[extension as keyof typeof SUPPORTED_VIDEO_FORMATS] || 'video/mp4';
}

/**
 * Check if a file extension is supported for video analysis
 */
export function isSupportedVideoFormat(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase().replace('.', '');
  return extension in SUPPORTED_VIDEO_FORMATS;
}

/**
 * Read a video file and convert it to base64
 * 
 * @param filePath - Path to the video file
 * @returns Base64 encoded video data
 * @throws Error if file doesn't exist or can't be read
 */
export function readVideoAsBase64(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Video file not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);

  // Warn about large files (Gemini has size limits, typically around 20MB for videos)
  if (fileSizeMB > 20) {
    console.warn(`Warning: Video file is ${fileSizeMB.toFixed(2)}MB. Large files may be rejected by the API.`);
  }

  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * Create a video message from a file path
 * 
 * This is a convenience function that handles:
 * - Reading the video file
 * - Converting to base64
 * - Determining the correct MIME type
 * - Creating a properly formatted BaseVideoMessage
 * 
 * @param filePath - Path to the video file
 * @param mimeType - Optional MIME type (auto-detected if not provided)
 * @returns A BaseVideoMessage ready to use with generateText()
 * 
 * @example
 * ```typescript
 * const videoMessage = createVideoMessage('my-video.mp4');
 * 
 * const result = await generateText({
 *   model,
 *   messages: [
 *     videoMessage,
 *     { role: 'user', text: 'What is in this video?' }
 *   ]
 * });
 * ```
 */
export function createVideoMessage(
  filePath: string,
  mimeType?: string
): BaseVideoMessage {
  if (!isSupportedVideoFormat(filePath)) {
    const extension = path.extname(filePath);
    console.warn(
      `Warning: File extension '${extension}' may not be supported. ` +
      `Supported formats: ${Object.keys(SUPPORTED_VIDEO_FORMATS).join(', ')}`
    );
  }

  const videoBase64 = readVideoAsBase64(filePath);
  const detectedMimeType = mimeType || getMimeTypeFromExtension(filePath);

  return {
    role: 'user',
    content: [{
      type: 'video_url',
      video_url: {
        mime_type: detectedMimeType,
        data: videoBase64
      }
    }]
  };
}

/**
 * Create a video message from a Buffer
 * 
 * @param buffer - Video data as a Buffer
 * @param mimeType - MIME type of the video
 * @returns A BaseVideoMessage ready to use with generateText()
 * 
 * @example
 * ```typescript
 * const buffer = await downloadVideo('https://example.com/video.mp4');
 * const videoMessage = createVideoMessageFromBuffer(buffer, 'video/mp4');
 * ```
 */
export function createVideoMessageFromBuffer(
  buffer: Buffer,
  mimeType: string = 'video/mp4'
): BaseVideoMessage {
  const videoBase64 = buffer.toString('base64');

  return {
    role: 'user',
    content: [{
      type: 'video_url',
      video_url: {
        mime_type: mimeType,
        data: videoBase64
      }
    }]
  };
}

/**
 * Create a video message from base64 data
 * 
 * @param base64Data - Base64 encoded video data
 * @param mimeType - MIME type of the video
 * @returns A BaseVideoMessage ready to use with generateText()
 * 
 * @example
 * ```typescript
 * const base64 = getBase64FromSomewhere();
 * const videoMessage = createVideoMessageFromBase64(base64, 'video/mp4');
 * ```
 */
export function createVideoMessageFromBase64(
  base64Data: string,
  mimeType: string = 'video/mp4'
): BaseVideoMessage {
  return {
    role: 'user',
    content: [{
      type: 'video_url',
      video_url: {
        mime_type: mimeType,
        data: base64Data
      }
    }]
  };
}

/**
 * Get information about a video file
 * 
 * @param filePath - Path to the video file
 * @returns Object with file information
 */
export function getVideoFileInfo(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Video file not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  const extension = path.extname(filePath).toLowerCase().replace('.', '');
  const mimeType = getMimeTypeFromExtension(filePath);
  const isSupported = isSupportedVideoFormat(filePath);

  return {
    path: filePath,
    name: path.basename(filePath),
    extension,
    mimeType,
    sizeBytes: stats.size,
    sizeMB: stats.size / (1024 * 1024),
    isSupported,
    created: stats.birthtime,
    modified: stats.mtime
  };
}

