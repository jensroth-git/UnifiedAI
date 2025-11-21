# Video Analysis Guide for UnifiedAI

This guide explains how to use video analysis capabilities with Google Gemini models in the UnifiedAI library.

## Quick Start

### 1. Basic Setup

```typescript
import { createGoogleProvider, generateText } from 'unified-ai';
import { createVideoMessage } from 'unified-ai/video-utils';

const createModel = createGoogleProvider(process.env.GOOGLE_API_KEY!);
const model = createModel('gemini-2.5-flash');
```

### 2. Analyze a Video File

```typescript
// Simple approach using utility functions
const videoMessage = createVideoMessage('my-video.mp4');

const result = await generateText({
  model,
  messages: [
    videoMessage,
    { role: 'user', text: 'What is happening in this video?' }
  ]
});

console.log(result.text);
```

## Supported Models

Video analysis is supported on the following Google Gemini models:

- `gemini-1.5-pro`
- `gemini-1.5-pro-latest`
- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite-preview-06-17`

**Note:** The older `gemini-pro-vision` model may work but has more limitations.

## Supported Video Formats

The following video formats are supported:

| Format | MIME Type | Extension |
|--------|-----------|-----------|
| MP4 | video/mp4 | .mp4 |
| MPEG | video/mpeg | .mpeg, .mpg |
| MOV | video/mov | .mov |
| AVI | video/avi | .avi |
| FLV | video/x-flv | .flv |
| WebM | video/webm | .webm |
| WMV | video/wmv | .wmv |
| 3GPP | video/3gpp | .3gp, .3gpp |

## Size Limitations

- **Recommended:** Keep videos under 20 MB for best performance
- **File Size:** Gemini has limits on the total size of media that can be processed
- **Duration:** Longer videos may take more time to process

The utility functions will warn you if your video file is larger than 20 MB.

## Usage Examples

### Example 1: Basic Video Analysis

```typescript
import { createGoogleProvider, generateText } from 'unified-ai';
import { createVideoMessage } from 'unified-ai/video-utils';

const model = createGoogleProvider(process.env.GOOGLE_API_KEY!)('gemini-2.5-flash');
const videoMessage = createVideoMessage('my-video.mp4');

const result = await generateText({
  model,
  messages: [
    videoMessage,
    { role: 'user', text: 'What is happening in this video?' }
  ]
});
```

### Example 2: Manual Video Message Creation

If you don't want to use the utility functions:

```typescript
import fs from 'fs';
import { BaseVideoMessage } from 'unified-ai';

const videoBuffer = fs.readFileSync('my-video.mp4');
const videoBase64 = videoBuffer.toString('base64');

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
```

### Example 3: Multiple Questions About a Video

```typescript
const videoMessage = createVideoMessage('my-video.mp4');

const questions = [
  'What objects do you see?',
  'What actions are taking place?',
  'What is the mood or atmosphere?'
];

for (const question of questions) {
  const result = await generateText({
    model,
    messages: [videoMessage, { role: 'user', text: question }]
  });
  
  console.log(`Q: ${question}`);
  console.log(`A: ${result.text}\n`);
}
```

### Example 4: Video from Buffer

If you're downloading videos or receiving them from another source:

```typescript
import { createVideoMessageFromBuffer } from 'unified-ai/video-utils';

const buffer = await downloadVideo('https://example.com/video.mp4');
const videoMessage = createVideoMessageFromBuffer(buffer, 'video/mp4');
```

### Example 5: Video from Base64

If you already have base64-encoded video data:

```typescript
import { createVideoMessageFromBase64 } from 'unified-ai/video-utils';

const base64Data = getBase64FromSomewhere();
const videoMessage = createVideoMessageFromBase64(base64Data, 'video/mp4');
```

## Utility Functions

### `createVideoMessage(filePath, mimeType?)`

Creates a video message from a file path. Auto-detects MIME type if not provided.

```typescript
const videoMessage = createVideoMessage('my-video.mp4');
```

### `createVideoMessageFromBuffer(buffer, mimeType)`

Creates a video message from a Buffer.

```typescript
const buffer = fs.readFileSync('video.mp4');
const videoMessage = createVideoMessageFromBuffer(buffer, 'video/mp4');
```

### `createVideoMessageFromBase64(base64Data, mimeType)`

Creates a video message from base64-encoded data.

```typescript
const videoMessage = createVideoMessageFromBase64(base64String, 'video/mp4');
```

### `getVideoFileInfo(filePath)`

Gets information about a video file.

```typescript
const info = getVideoFileInfo('my-video.mp4');
console.log(info.sizeMB); // File size in megabytes
console.log(info.mimeType); // Detected MIME type
console.log(info.isSupported); // Whether format is supported
```

### `getMimeTypeFromExtension(filePath)`

Gets the MIME type for a video file based on its extension.

```typescript
const mimeType = getMimeTypeFromExtension('video.mp4'); // 'video/mp4'
```

### `isSupportedVideoFormat(filePath)`

Checks if a video file format is supported.

```typescript
if (isSupportedVideoFormat('video.mp4')) {
  console.log('Format is supported!');
}
```

## Best Practices

### 1. Video Quality

- Use clear, well-lit videos for best results
- Avoid very shaky or blurry footage
- Ensure good contrast between objects and background

### 2. Prompt Engineering

Be specific in your prompts:

```typescript
// Good prompts
"Describe the main actions taking place in this video"
"List all the objects you can identify in this video"
"What is the person doing between 0:05 and 0:15?"

// Less effective prompts
"What is this?"
"Tell me about this"
```

### 3. Performance

- Keep videos under 20 MB when possible
- Consider splitting very long videos into segments
- Process videos sequentially rather than in parallel to avoid rate limits

### 4. Error Handling

Always handle errors when processing videos:

```typescript
try {
  const videoMessage = createVideoMessage('my-video.mp4');
  const result = await generateText({ model, messages: [videoMessage, ...] });
} catch (error) {
  console.error('Error processing video:', error.message);
  // Handle error appropriately
}
```

## Examples in This Repository

- **`video-simple-example.ts`** - Simple example using utility functions
- **`video-example.ts`** - More comprehensive example with multiple features
- **`examples.ts`** - Contains `videoAnalysisExample()` function

## Troubleshooting

### "Video file not found" error

Make sure the file path is correct and the file exists:

```typescript
import fs from 'fs';
if (!fs.existsSync('my-video.mp4')) {
  console.error('File does not exist!');
}
```

### "File too large" warning

If your video is over 20 MB, consider:
- Compressing the video
- Reducing the resolution
- Shortening the video duration
- Using a more efficient codec (e.g., H.264)

### API errors

If you receive API errors:
- Ensure you're using a model that supports video (e.g., `gemini-1.5-pro` or newer)
- Check that your API key has the necessary permissions
- Verify the video format is supported

## Related Documentation

- [Main README](./README.md) - General library documentation
- [Examples](./examples.ts) - Additional usage examples
- [CHANGELOG](./CHANGELOG.md) - Version history and updates

## Need Help?

If you encounter issues with video analysis:

1. Check the [Google Gemini API documentation](https://ai.google.dev/gemini-api/docs/vision)
2. Verify your video meets the format and size requirements
3. Try with a smaller, simpler video first
4. Check the console for detailed error messages

