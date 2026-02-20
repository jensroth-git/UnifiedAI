/**
 * Example usage of the unified-ai package
 * This file demonstrates various features and use cases
 */

// Load environment variables from .env file
import 'dotenv/config';

import {z} from 'zod';
import fs from 'fs';

import {BaseImageMessage, BaseMessage, BaseModel, BaseTool, BaseVideoMessage, createClaudeProvider, createGoogleProvider, createOpenAIProvider, generateText, Signal} from './index';

// ============================================
// Example 1: Basic Text Generation
// ============================================

async function basicExample(model: BaseModel) {
  console.log('=== Basic Text Generation ===\n');

  const result = await generateText({
    model,
    messages: [
      {role: 'system', text: 'You are a helpful assistant.'},
      {role: 'user', text: 'What is the capital of France?'}
    ]
  });

  console.log('Response:', result.text);
  console.log('Messages:', result.addedMessages);
}

// ============================================
// Example 2: Tool Calling
// ============================================

async function toolCallingExample(model: BaseModel) {
  console.log('\n=== Tool Calling Example ===\n');

  // Define tools
  const tools: Record<string, BaseTool> = {
    get_weather: {
      description: 'Get the current weather for a location',
      parameters: z.object({
        location: z.string().describe('City name or address'),
        units: z.enum(['celsius', 'fahrenheit'])
                   .default('celsius')
                   .describe('Temperature units')
      }),
      execute: async (args) => {
        console.log(`Getting weather for ${args.location}...`);
        // Simulate API call
        return {
          temperature: 22,
          conditions: 'sunny',
          location: args.location,
          units: args.units
        };
      }
    },
    calculate: {
      description: 'Perform a mathematical calculation',
      parameters: z.object({
        expression: z.string().describe('Mathematical expression to evaluate')
      }),
      execute: async (args) => {
        console.log(`Calculating: ${args.expression}`);
        try {
          // WARNING: eval is dangerous in production! This is just for
          // demonstration
          const result = eval(args.expression);
          return {result, expression: args.expression};
        } catch (error) {
          return {error: 'Invalid expression'};
        }
      }
    }
  };

  const result = await generateText({
    model,
    messages: [{
      role: 'user',
      text: 'What\'s the weather in London? Also, what is 15 * 7?'
    }],
    tools,
    maxToolRoundtrips: 5
  });

  console.log('\nAll messages:');
  result.addedMessages.forEach((msg, i) => {
    console.log(`${i + 1}.`, JSON.stringify(msg, null, 2));
  });
}

// ============================================
// Example 3: Image Analysis
// ============================================

async function imageAnalysisExample(model: BaseModel) {
  console.log('\n=== Image Analysis ===\n');

  // Example with a base64 encoded image
  // In real usage, you would read this from a file
  const dummyImageBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAsTAAALEwEAmpwYAAADFUlEQVRogdWZz0sbQRTHXx6K0FiIiGlLa0uXEJCiFsRePIiexFsFNfgvePfmKTfvAQOeJSroQRAPkiDEHCpC2eOSppgf2m4QArpCyCGlbA/S7MzOTGbizucUZmcmecl3Z7/vm1C73QadQdAcBM1B0BwEzUHQHATNQdAcBM1B0BwEzUHQHATN6RNYYx0cfF9ZoUz4vL8fX16Grol9yZIuFb/Ni/8CP7a3u5wgEeRdUDfN+yzxi3G5z2brpgnBLKB6dsYyzb68hAAW0HKccjrNMrO4tQUBLKCWzzcti2Vm07JuCgUIWgG/Ly7YJ1dOT0E9IfaeuOU4R4ODXLt/fXjoD4chIMfoz5MTz/FPOzukJbV8HhSD7FMrh4ee40NjY8OJhPeS42MISAGNUukuk+kcH4jHRyYnR5eWPFfdplKPtg1BKKCWy3mOv15d7Q+Ho1NTpIXV83MIQgFFwrk+urAAABHDeDn/765iFF5PC7gpFDyPf1c/7uv3a2uea+8ymUapBM9bQIVworv6cV+/nZvjlZ8U/AtoOc6vvT2KflwoKlJqK1DYPjzVD11FTctSZ07RdwbpLH+qH18VMXpY+QU82vZtKuWrH18VldPpluNA7wuoEk7xTv34qkiRrUCx5rBTP74q4nKycgqgdI+d+nGJGMZAPO556TqZVKEiFGgLSfpxiW1s8PpZVQWQzm+Sflyi09OkSypsBfLaB4p+XEYmJkgqUmEr+gQawvzMjPD72VdXEcMA1b9Ay3Guk0lQgPTMC3t2tynKvLD3Jl6urUD27lEWjNGYeAFK7bv0zAs7h8q7u6AYiZlX6L9gq26aOfJTliuoov+NwLJVTCDYotxhHzY3uWI2SlQh8aBD9vB5aHyca+uIYZACr7/mVFLcguzh88fFRd7dSYGXxMwLGZPAN+vrAjEtXUVSMi9k6R4B4NXsrMDulCZTlq1Axu/jnVABlCbTtRWNrs0pstiH4UTiRTQq9gaUJlPKQxNZ7APlXvSF0mRKybw4/qEJJgiag6A5CJqDoDkImoOgOQiag6A5+NwfoFv+APymT+qbfNavAAAAAElFTkSuQmCC';

  const imageMessage: BaseImageMessage = {
    role: 'user',
    content: [{
      type: 'image_url',
      image_url:
          {url: `data:image/png;base64,${dummyImageBase64}`, detail: 'high'}
    }]
  };

  const result = await generateText({
    model,
    messages:
        [imageMessage, {role: 'user', text: 'What do you see in this image?'}]
  });

  console.log('Image analysis:', result.text);
}

// ============================================
// Example 4: Video Analysis (Google Gemini only)
// ============================================

async function videoAnalysisExample(model: BaseModel) {
  console.log('\n=== Video Analysis (Google Gemini) ===\n');

  // Example: Read video file and convert to base64
  // In real usage, you would use fs.readFileSync to read the video file
  // const videoBuffer = fs.readFileSync('path/to/video.mp4');
  // const videoBase64 = videoBuffer.toString('base64');

  // For demonstration, using a placeholder
  // In practice, replace this with actual video data
  const videoBase64 = 'REPLACE_WITH_ACTUAL_VIDEO_BASE64_DATA';

  const videoMessage: BaseVideoMessage = {
    role: 'user',
    content: [{
      type: 'video_url',
      video_url: {
        mime_type: 'video/mp4',
        data: videoBase64
      }
    }]
  };

  const result = await generateText({
    model,
    messages: [
      videoMessage,
      {role: 'user', text: 'What is happening in this video? Describe the main actions and objects.'}
    ]
  });

  console.log('Video analysis:', result.text);
}

// ============================================
// Example 5: Conversation with Stop Signal
// ============================================

async function stopSignalExample(model: BaseModel) {
  console.log('\n=== Stop Signal Example ===\n');

  const stopSignal = new Signal();

  // Set a timer to stop after 2 seconds
  setTimeout(() => {
    console.log('Stopping generation...');
    stopSignal.set();
  }, 2000);

  const result = await generateText({
    model,
    messages:
        [{role: 'user', text: 'Write a very long story about a dragon...'}],
    stopSignal
  });

  console.log('Result (potentially incomplete):', result.text);
}

// ============================================
// Example 6: Streaming Text Callback
// ============================================

async function streamingExample(model: BaseModel) {
  console.log('\n=== Streaming Text Callback ===\n');

  await generateText({
    model,
    messages: [{role: 'user', text: 'Count from 1 to 5 slowly.'}],
    textMessageGenerated: async (message) => {
      console.log('Stream:', message.text);
    }
  });
}

// ============================================
// Example 7: Complex Tool with Force Stop
// ============================================

async function forceStopToolExample(model: BaseModel) {
  console.log('\n=== Force Stop Tool Example ===\n');

  const tools: Record<string, BaseTool> = {
    check_authorization: {
      description: 'Check if the user is authorized to proceed',
      parameters: z.object({userId: z.string().describe('User ID to check')}),
      execute: async (args, options) => {
        console.log(`Checking authorization for user: ${args.userId}`);

        const isAuthorized = args.userId === 'admin';

        if (!isAuthorized) {
          // Force the conversation to stop
          options.forceStop = true;
          return {authorized: false, message: 'Unauthorized access'};
        }

        return {authorized: true, message: 'Access granted'};
      }
    },
    sensitive_operation: {
      description: 'Perform a sensitive operation (requires authorization)',
      parameters: z.object({action: z.string().describe('Action to perform')}),
      execute: async (args) => {
        return {success: true, action: args.action};
      }
    }
  };

  const result = await generateText({
    model,
    messages: [
      {
        role: 'system',
        text:
            'Always check authorization before performing sensitive operations.'
      },
      {
        role: 'user',
        text: 'My user ID is "guest". Please perform a sensitive operation.'
      }
    ],
    tools,
    maxToolRoundtrips: 5
  });

  console.log('\nConversation stopped due to authorization failure');
  console.log('Messages:', result.addedMessages.length);
}

// ============================================
// Example 8: Conversation History
// ============================================

async function conversationHistoryExample(model: BaseModel) {
  console.log('\n=== Conversation History Example ===\n');

  // Start with initial messages
  let messages: BaseMessage[] = [
    {role: 'system' as const, text: 'You are a helpful math tutor.'},
    {role: 'user' as const, text: 'What is 5 + 3?'}
  ];

  // First turn
  let result = await generateText({model, messages});

  console.log('Assistant:', result.text);
  messages = [...messages, ...result.addedMessages];

  // Second turn
  messages.push({role: 'user', text: 'And what is that multiplied by 2?'});

  result = await generateText({model, messages});

  console.log('Assistant:', result.text);
  messages = [...messages, ...result.addedMessages];

  // Third turn
  messages.push({role: 'user', text: 'Great! Now subtract 10 from that.'});

  result = await generateText({model, messages});

  console.log('Assistant:', result.text);

  console.log('\nFull conversation:');
  messages.forEach((msg, i) => {
    if ('text' in msg) {
      console.log(`${i + 1}. [${msg.role}]: ${msg.text}`);
    }
  });
}

// ============================================
// Example 9: Image Generation (Google Gemini 3 Pro Image Preview only)
// ============================================

async function imageGenerationExample(model: BaseModel) {
  console.log('\n=== Image Generation Example ===\n');

  const result = await generateText({model, messages: [{role: 'user', text: 'Generate an image of a cat.'}]});

  //extract the image url from the added messages
  const imageMessage = (result.addedMessages[0] as BaseImageMessage);
  console.log('Image URL:', imageMessage.content[0].image_url.url);

  //save base64 url to file
  const imageBase64 = imageMessage.content[0].image_url.url.split(',')[1];
  fs.writeFileSync('image.jpg', Buffer.from(imageBase64, 'base64'));
}

// ============================================
// Main execution
// ============================================

async function main() {
  console.log('Unified AI Examples\n');
  console.log('Make sure to set your API keys in environment variables:');
  console.log('- OPENAI_API_KEY');
  console.log('- ANTHROPIC_API_KEY');
  console.log('- GOOGLE_API_KEY\n');

  try {
    // Create model (choose your provider)
    // OpenAI example
    const createModel =
        createOpenAIProvider({apiKey: process.env.OPENAI_API_KEY});
    const model = createModel("gpt-5.1");

    // Claude example
    // const createModel = createClaudeProvider({apiKey:
    // process.env.ANTHROPIC_API_KEY}); const model =
    // createModel('claude-opus-4-6');

    // Google example
    // const createModel = createGoogleProvider(process.env.GOOGLE_API_KEY!);
    // const model = createModel('gemini-3-pro-preview');

    // Uncomment the examples you want to run
    // await basicExample(model);
    // await toolCallingExample(model);
    // await imageAnalysisExample(model);
    // await videoAnalysisExample(model); // Google Gemini only
    // await stopSignalExample(model);
    // await streamingExample(model);
    // await forceStopToolExample(model);
    // await conversationHistoryExample(model);
    // await imageGenerationExample(model);

    console.log('\nUncomment examples in the main() function to run them.');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
