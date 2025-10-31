# Unified AI

A unified interface for interacting with multiple AI providers (OpenAI, Claude, and Google Gemini) with consistent message handling, tool calling support, and cross-provider compatibility.

## Features

- 🔄 **Unified API** - Single interface works across OpenAI, Claude, and Google Gemini
- 🛠️ **Tool Calling** - Consistent tool/function calling support with Zod schema validation
- 📝 **Type-Safe** - Full TypeScript support with comprehensive type definitions
- 🖼️ **Multimodal** - Support for text, images, and audio inputs
- 🔁 **Tool Roundtrips** - Automatic handling of multi-turn tool calling conversations
- ⚡ **Rate Limiting** - Built-in rate limit handling for Claude API
- 🎯 **Stop Signals** - Graceful interruption of generation processes

## Installation

```bash
npm install unified-ai
```

You'll also need to install the SDK for the provider(s) you plan to use:

```bash
# For OpenAI
npm install openai

# For Claude/Anthropic
npm install @anthropic-ai/sdk

# For Google Gemini
npm install @google/genai
```

## Quick Start

### OpenAI

```typescript
import { createOpenAIProvider, generateText } from 'unified-ai';

const createModel = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY
});

const model = createModel('gpt-4.1');

const result = await generateText({
  model,
  messages: [
    { role: 'system', text: 'You are a helpful assistant.' },
    { role: 'user', text: 'Hello! How are you?' }
  ]
});

console.log(result.text);
```

### Claude

```typescript
import { createClaudeProvider, generateText } from 'unified-ai';

const createModel = createClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const model = createModel('claude-3-5-sonnet-20241022', 4096);

const result = await generateText({
  model,
  messages: [
    { role: 'system', text: 'You are a helpful assistant.' },
    { role: 'user', text: 'Hello! How are you?' }
  ]
});

console.log(result.text);
```

### Google Gemini

```typescript
import { createGoogleProvider, generateText } from 'unified-ai';

const createModel = createGoogleProvider(process.env.GOOGLE_API_KEY!);

const model = createModel('gemini-2.5-flash');

const result = await generateText({
  model,
  messages: [
    { role: 'system', text: 'You are a helpful assistant.' },
    { role: 'user', text: 'Hello! How are you?' }
  ]
});

console.log(result.text);
```

## Tool Calling

One of the most powerful features is consistent tool calling across all providers:

```typescript
import { z } from 'zod';
import { createOpenAIProvider, generateText, BaseTool } from 'unified-ai';

const createModel = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY
});

const model = createModel('gpt-4.1');

// Define tools with Zod schemas
const tools: Record<string, BaseTool> = {
  get_weather: {
    description: 'Get the current weather for a location',
    parameters: z.object({
      location: z.string().describe('City name or address'),
      units: z.enum(['celsius', 'fahrenheit']).default('celsius')
    }),
    execute: async (args) => {
      // Your implementation here
      return {
        temperature: 22,
        conditions: 'sunny',
        location: args.location
      };
    }
  },
  search_web: {
    description: 'Search the web for information',
    parameters: z.object({
      query: z.string().describe('Search query')
    }),
    execute: async (args) => {
      // Your implementation here
      return {
        results: ['Result 1', 'Result 2']
      };
    }
  }
};

const result = await generateText({
  model,
  messages: [
    { role: 'user', text: 'What\'s the weather in London?' }
  ],
  tools,
  maxToolRoundtrips: 5
});

console.log(result.addedMessages);
```

## Multimodal Support

### Images

```typescript
import { generateText } from 'unified-ai';
import fs from 'fs';

const imageBase64 = fs.readFileSync('image.jpg', 'base64');

const result = await generateText({
  model,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
            detail: 'high'
          }
        }
      ]
    },
    { role: 'user', text: 'What do you see in this image?' }
  ]
});
```

### Audio (Google Gemini)

```typescript
const result = await generateText({
  model,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'audio_url',
          audio_url: {
            mime_type: 'audio/mp3',
            data: audioBase64
          }
        }
      ]
    }
  ]
});
```

## Advanced Features

### Stop Signals

Gracefully interrupt long-running generations:

```typescript
import { Signal, generateText } from 'unified-ai';

const stopSignal = new Signal();

// Start generation
const promise = generateText({
  model,
  messages: [{ role: 'user', text: 'Write a very long story...' }],
  stopSignal
});

// Later, to stop:
stopSignal.set();

await promise;
```

### Text Streaming Callback

Get notified as text is generated:

```typescript
const result = await generateText({
  model,
  messages: [{ role: 'user', text: 'Hello!' }],
  textMessageGenerated: async (message) => {
    console.log('Assistant:', message.text);
  }
});
```

### Tool Force Stop

Tools can force the conversation to stop:

```typescript
const tools = {
  emergency_stop: {
    description: 'Stop the conversation immediately',
    parameters: z.object({}),
    execute: async (args, options) => {
      options.forceStop = true;
      return { stopped: true };
    }
  }
};
```

## Message Types

The library supports various message types:

```typescript
// System message
{ role: 'system', text: 'You are a helpful assistant.' }

// User text message
{ role: 'user', text: 'Hello!' }

// Assistant text message
{ role: 'assistant', text: 'Hi there!' }

// Image message
{
  role: 'user',
  content: [{
    type: 'image_url',
    image_url: { url: 'data:image/jpeg;base64,...' }
  }]
}

// Audio message (Google only)
{
  role: 'user',
  content: [{
    type: 'audio_url',
    audio_url: { mime_type: 'audio/mp3', data: '...' }
  }]
}

// Tool call (generated by AI)
{
  role: 'assistant',
  functionCall: {
    id: 'call_123',
    name: 'get_weather',
    args: { location: 'London' }
  }
}

// Tool response (your code)
{
  role: 'function',
  functionResponse: {
    id: 'call_123',
    name: 'get_weather',
    response: { temperature: 22 }
  }
}
```

## API Reference

### Provider Creation

#### `createOpenAIProvider(options)`

```typescript
const createModel = createOpenAIProvider({
  apiKey: string,      // Optional, defaults to OPENAI_API_KEY env var
  baseURL?: string     // Optional, for custom endpoints
});

const model = createModel(modelId: string);
```

#### `createClaudeProvider(options)`

```typescript
const createModel = createClaudeProvider({
  apiKey?: string,     // Optional, defaults to ANTHROPIC_API_KEY env var
  baseURL?: string     // Optional, for custom endpoints
});

const model = createModel(
  modelId: string,
  maxTokens?: number   // Max tokens for response (default: 4096)
);
```

#### `createGoogleProvider(apiKey)`

```typescript
const createModel = createGoogleProvider(apiKey: string);

const model = createModel(
  modelId: string,
  safetySettings?: GoogleSafetySettings
);
```

### `generateText(options)`

Main function for text generation:

```typescript
interface GenerateTextOptions {
  model: BaseModel;                    // The model to use
  messages?: BaseMessage[];            // Conversation history
  maxToolRoundtrips?: number;          // Max tool calling rounds (default: 5)
  tools?: Record<string, BaseTool>;    // Available tools
  toolChoice?: 'auto' | 'none' | 'required';  // Tool calling mode
  thinking?: boolean;                  // Enable thinking mode (if supported)
  stopSignal?: Signal;                 // Signal to stop generation
  textMessageGenerated?: (message: BaseTextMessage) => Promise<void>;
}

interface generateTextReturn {
  addedMessages: BaseMessage[];        // All messages added during generation
  text: string;                        // Final text response
}
```

### `BaseTool`

Tool definition:

```typescript
interface BaseTool {
  description: string;                 // Tool description
  parameters: z.AnyZodObject;          // Zod schema for parameters
  execute: (args: any, options: BaseToolOptions) => any;
}

interface BaseToolOptions {
  forceStop?: boolean;                 // Set to true to stop after this tool
}
```

### `Signal`

Control signal for stopping generation:

```typescript
class Signal {
  set(): void;                         // Set the signal
  clear(): void;                       // Clear the signal
  isSet(): boolean;                    // Check if signal is set
  waitUntilReset(): Promise<void>;     // Wait for signal to clear
}
```

## Rate Limiting

The Claude provider includes built-in rate limit handling:
- Automatically tracks token usage
- Proactively waits when approaching limits
- Retries with exponential backoff on 429 errors
- Extracts rate limit info from API response headers

## Best Practices

1. **Use environment variables** for API keys
2. **Set appropriate maxTokens** to avoid excessive costs
3. **Define clear tool descriptions** for better AI understanding
4. **Use Zod schemas** to validate tool parameters
5. **Implement proper error handling** around API calls
6. **Use stopSignals** for long-running operations
7. **Monitor tool roundtrips** to prevent infinite loops

## Error Handling

```typescript
try {
  const result = await generateText({
    model,
    messages: [{ role: 'user', text: 'Hello!' }]
  });
} catch (error) {
  console.error('Generation failed:', error);
}
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

