/**
 * Example: Video Analysis with Google Gemini
 * 
 * This example demonstrates how to analyze video content using the UnifiedAI library
 * with Google Gemini models that support video input.
 * 
 * Prerequisites:
 * - Set GOOGLE_API_KEY environment variable
 * - Have a video file (e.g., my-video.mp4) in the same directory
 * - Use a Gemini model that supports video (e.g., gemini-1.5-pro, gemini-2.5-pro, gemini-2.5-flash)
 */

import fs from 'fs';
import 'dotenv/config';
import { createGoogleProvider, generateText, BaseVideoMessage } from './index';

// Configuration
const MODEL_NAME = 'gemini-2.5-flash'; // or 'gemini-1.5-pro', 'gemini-2.5-pro'
const VIDEO_FILE_PATH = 'my-video.mp4'; // Path to your video file
const API_KEY = process.env.GOOGLE_API_KEY;

async function analyzeVideo() {
  // 1. Validate API key
  if (!API_KEY) {
    console.error('Error: GOOGLE_API_KEY is not set. Please create a .env file with your API key.');
    process.exit(1);
  }

  // 2. Check if video file exists
  if (!fs.existsSync(VIDEO_FILE_PATH)) {
    console.error(`Error: Video file not found: ${VIDEO_FILE_PATH}`);
    process.exit(1);
  }

  console.log(`Analyzing video: ${VIDEO_FILE_PATH}...`);

  // 3. Read video file and convert to base64
  const videoBuffer = fs.readFileSync(VIDEO_FILE_PATH);
  const videoBase64 = videoBuffer.toString('base64');

  // 4. Determine MIME type based on file extension
  const extension = VIDEO_FILE_PATH.split('.').pop()?.toLowerCase();
  const mimeTypeMap: Record<string, string> = {
    'mp4': 'video/mp4',
    'mpeg': 'video/mpeg',
    'mpg': 'video/mpg',
    'mov': 'video/mov',
    'avi': 'video/avi',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    'wmv': 'video/wmv',
    '3gp': 'video/3gpp'
  };
  
  const mimeType = mimeTypeMap[extension || 'mp4'] || 'video/mp4';
  console.log(`Video MIME type: ${mimeType}`);

  // 5. Create the Gemini model
  const createModel = createGoogleProvider(API_KEY);
  const model = createModel(MODEL_NAME);

  // 6. Create video message
  const videoMessage: BaseVideoMessage = {
    role: 'user',
    content: [{
      type: 'video_url',
      video_url: {
        mime_type: mimeType,
        data: videoBase64
      }
    }]
  };

  // 7. Define the prompt
  const prompt = 'What is happening in this video? Describe the main actions, objects, and any notable details you observe.';

  try {
    // 8. Send the request to Gemini
    console.log('\nSending request to Gemini...\n');
    
    const result = await generateText({
      model,
      messages: [
        videoMessage,
        { role: 'user', text: prompt }
      ]
    });

    // 9. Display the response
    console.log('--- Gemini\'s Video Analysis ---');
    console.log(result.text);
    console.log('-------------------------------\n');

  } catch (error) {
    console.error('An error occurred:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Advanced example: Multiple questions about the same video
async function analyzeVideoWithMultipleQuestions() {
  if (!API_KEY) {
    console.error('Error: GOOGLE_API_KEY is not set.');
    process.exit(1);
  }

  if (!fs.existsSync(VIDEO_FILE_PATH)) {
    console.error(`Error: Video file not found: ${VIDEO_FILE_PATH}`);
    process.exit(1);
  }

  console.log(`\n=== Advanced: Multiple Questions About Video ===\n`);

  // Read and prepare video
  const videoBuffer = fs.readFileSync(VIDEO_FILE_PATH);
  const videoBase64 = videoBuffer.toString('base64');
  
  const extension = VIDEO_FILE_PATH.split('.').pop()?.toLowerCase();
  const mimeType = extension === 'mp4' ? 'video/mp4' : `video/${extension}`;

  const createModel = createGoogleProvider(API_KEY);
  const model = createModel(MODEL_NAME);

  const videoMessage: BaseVideoMessage = {
    role: 'user',
    content: [{
      type: 'video_url',
      video_url: {
        mime_type: mimeType,
        data: videoBase64
      }
    }]
  };

  // Ask multiple questions about the video
  const questions = [
    'What are the main objects or people in this video?',
    'What actions are taking place?',
    'What is the overall mood or atmosphere?',
    'Can you estimate the duration and describe what happens at different time points?'
  ];

  for (const question of questions) {
    console.log(`\nQuestion: ${question}`);
    console.log('Answer: ');
    
    try {
      const result = await generateText({
        model,
        messages: [videoMessage, { role: 'user', text: question }]
      });

      console.log(result.text);
      console.log('---');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
    }
  }
}

// Run the examples
async function main() {
  console.log('=== Video Analysis with Google Gemini ===\n');
  
  // Run basic example
  await analyzeVideo();
  
  // Uncomment to run advanced example with multiple questions
  // await analyzeVideoWithMultipleQuestions();
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { analyzeVideo, analyzeVideoWithMultipleQuestions };

