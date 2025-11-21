/**
 * Simple Video Analysis Example using Utility Functions
 * 
 * This example shows the easiest way to analyze videos with Google Gemini
 * using the provided utility functions.
 */

import 'dotenv/config';
import { createGoogleProvider, generateText } from './index';
import { createVideoMessage, getVideoFileInfo } from './video-utils';

const MODEL_NAME = 'gemini-2.5-flash';
const VIDEO_FILE_PATH = 'my-video.mp4';

async function main() {
  // Check API key
  if (!process.env.GOOGLE_API_KEY) {
    console.error('Error: GOOGLE_API_KEY is not set.');
    process.exit(1);
  }

  console.log('=== Simple Video Analysis ===\n');

  try {
    // Get video file info
    const videoInfo = getVideoFileInfo(VIDEO_FILE_PATH);
    console.log('Video Info:');
    console.log(`  Name: ${videoInfo.name}`);
    console.log(`  Size: ${videoInfo.sizeMB.toFixed(2)} MB`);
    console.log(`  Format: ${videoInfo.extension} (${videoInfo.mimeType})`);
    console.log(`  Supported: ${videoInfo.isSupported ? 'Yes' : 'No'}\n`);

    // Create model
    const createModel = createGoogleProvider(process.env.GOOGLE_API_KEY);
    const model = createModel(MODEL_NAME);

    // Create video message using utility function
    const videoMessage = createVideoMessage(VIDEO_FILE_PATH);

    // Analyze the video
    console.log('Analyzing video...\n');
    const result = await generateText({
      model,
      messages: [
        videoMessage,
        { role: 'user', text: 'What is happening in this video? Describe the main actions and objects.' }
      ]
    });

    // Display result
    console.log('--- Analysis Result ---');
    console.log(result.text);
    console.log('----------------------\n');

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { main };

