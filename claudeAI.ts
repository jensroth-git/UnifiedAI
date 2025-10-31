import { Anthropic } from "@anthropic-ai/sdk";
import { BaseImageMessage, BaseMessage, BaseModel, BaseSystemMessage, BaseTextMessage, BaseTool, BaseToolCall, BaseToolOptions, BaseToolResponse, GenerateTextOptions, generateTextReturn } from "./AIBase";
import { z } from "zod";

export type ClaudeModelId = Anthropic.Model | "claude-sonnet-4-5-20250929" | "claude-haiku-4-5-20251001" | (string & {});

// Define interfaces to match Anthropic SDK's structure
interface AnthropicToolUse {
    type: "tool_use";
    id: string;
    name: string;
    input: any;
}

interface AnthropicToolResult {
    type: "tool_result";
    tool_use_id: string;
    content: string | any;
}

interface AnthropicTextBlock {
    type: "text";
    text: string;
}

type AnthropicContentBlock = AnthropicToolUse | AnthropicToolResult | AnthropicTextBlock;

export class ClaudeModel extends BaseModel {
    provider: Anthropic;
    modelID: ClaudeModelId;
    maxTokens?: number;

    // Cached rate limit information
    private static rateLimitInfo = {
        remainingTokens: 20000, // Default to max limit
        resetTime: 0, // Timestamp when the limit resets
        lastChecked: 0 // When we last updated this info
    };

    constructor(provider: Anthropic, model: ClaudeModelId, maxTokens?: number) {
        super();

        this.provider = provider;
        this.modelID = model;
        this.maxTokens = maxTokens;
    }

    /**
     * Checks if we're close to hitting rate limits and waits if necessary
     * Returns true if it's safe to proceed, false if we should wait
     * 
     * This function implements proactive rate limiting to avoid 429 errors:
     * - It tracks token usage across requests
     * - It pauses execution when approaching limits
     * - It resumes once rate limits have reset
     */
    private async checkRateLimits(estimatedInputTokens: number = 1000): Promise<void> {
        const now = Date.now();
        const LOW_TOKEN_THRESHOLD = 5000; // Warning threshold

        // If rate limit has reset since we last checked, restore default values
        if (now > ClaudeModel.rateLimitInfo.resetTime) {
            ClaudeModel.rateLimitInfo.remainingTokens = 20000;
            ClaudeModel.rateLimitInfo.resetTime = 0;
        }

        // Log warning if tokens are running low
        if (ClaudeModel.rateLimitInfo.remainingTokens < LOW_TOKEN_THRESHOLD) {
            console.warn(`[CLAUDE] Low on remaining tokens: ${ClaudeModel.rateLimitInfo.remainingTokens} remaining. ` +
                `Reset at ${new Date(ClaudeModel.rateLimitInfo.resetTime).toISOString()}`);
        }

        // If we have enough tokens remaining, proceed
        if (ClaudeModel.rateLimitInfo.remainingTokens > estimatedInputTokens + 2000) {
            // We have enough tokens with buffer, proceed but decrement our estimate
            ClaudeModel.rateLimitInfo.remainingTokens -= estimatedInputTokens;
            return;
        }

        // Otherwise, we need to wait until reset
        if (ClaudeModel.rateLimitInfo.resetTime > 0) {
            const waitTime = Math.max(0, ClaudeModel.rateLimitInfo.resetTime - now);

            if (waitTime > 0) {
                console.log(`Approaching rate limit. Waiting ${Math.ceil(waitTime / 1000)} seconds for limits to reset.`);
                await new Promise(resolve => setTimeout(resolve, waitTime));

                // After waiting, reset our tracking
                ClaudeModel.rateLimitInfo.remainingTokens = 20000;
                ClaudeModel.rateLimitInfo.resetTime = 0;
            }
        }
    }

    /**
     * Updates rate limit information from API response headers
     * Extracts remaining tokens and reset time to manage future requests
     */
    private updateRateLimitInfo(headers: any): void {
        if (!headers) return;

        // Extract rate limit information from headers
        const remaining = headers['anthropic-ratelimit-input-tokens-remaining'];
        const resetStr = headers['anthropic-ratelimit-input-tokens-reset'];

        if (remaining !== undefined) {
            ClaudeModel.rateLimitInfo.remainingTokens = parseInt(remaining);

            // Log when we're getting low on tokens
            if (ClaudeModel.rateLimitInfo.remainingTokens < 5000) {
                console.warn(`[CLAUDE] Running low on tokens: ${ClaudeModel.rateLimitInfo.remainingTokens} remaining`);
            }
        }

        if (resetStr) {
            // Convert reset time to timestamp
            try {
                const resetDate = new Date(resetStr);
                ClaudeModel.rateLimitInfo.resetTime = resetDate.getTime();
                console.log(`[CLAUDE] Rate limits reset at: ${resetDate.toISOString()}`);
            } catch (e) {
                // If we can't parse the date, set a reasonable default (60 seconds)
                ClaudeModel.rateLimitInfo.resetTime = Date.now() + 60000;
            }
        }

        ClaudeModel.rateLimitInfo.lastChecked = Date.now();
    }

    convertMessagesForClaude(messages?: BaseMessage[]): Anthropic.Messages.MessageParam[] {
        if (!messages || messages.length === 0) {
            return [];
        }

        // const toolUseMap = new Map<string, AnthropicToolUse>(); // Maps tool_use_id to the tool_use message
        const claudeMessages: Anthropic.Messages.MessageParam[] = [];
        const systemMessages: string[] = [];

        // First pass: process system messages and collect tool use information
        for (const message of messages) {
            if (message.role === 'system') {
                // Collect system messages to be included in first user message
                systemMessages.push((message as BaseSystemMessage).text);
            }
            // else if (message.role === 'assistant' && (message as BaseToolCall).functionCall) {
            // Store tool use information for pairing with responses
            // const toolCall = (message as BaseToolCall).functionCall;
            // toolUseMap.set(toolCall.id, {
            //     type: "tool_use",
            //     id: toolCall.id,
            //     name: toolCall.name,
            //     input: toolCall.args ? JSON.parse(toolCall.args) : {}
            // });
            // }
        }

        // Second pass: build proper Claude messages with tool use/result pairs
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];

            if (message.role === 'system') {
                // System messages are handled separately
                continue;
            } else if (message.role === 'user') {
                if ((message as BaseImageMessage).content) {
                    //we have to parse the header
                    //rgb_image_url: `data:image/jpeg;base64,${this.rgbBase64}`,
                    //into 
                    /*
                    {
                        "type": "image",
                        "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": "/9j/4AAQSkZJRg...",
                                }
                    },
                     */
                    //TODO: handle urls
                    const imageContents: Anthropic.Messages.ImageBlockParam[] = [];

                    for (const content of (message as BaseImageMessage).content) {
                        //we have to parse the header
                        const url = content.image_url.url;
                        const header = url.substring(0, url.indexOf(","));
                        const excludeData = header.substring(header.indexOf(":") + 1);
                        const mediaType = excludeData.substring(0, excludeData.indexOf(";"));
                        // const base64 = excludeData.substring(excludeData.indexOf(";") + 1);
                        const payload = url.substring(url.indexOf(",") + 1);

                        imageContents.push({
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                                data: payload
                            }
                        });
                    }

                    claudeMessages.push({
                        role: "user",
                        content: imageContents
                    });
                }
                else if ((message as BaseTextMessage).text) {
                    // Handle user messages
                    let content: string | any[] = (message as BaseTextMessage).text;

                    // For the first user message, prepend system messages in Claude's format
                    if (i === 0 || (i === 1 && messages[0].role === 'system')) {
                        if (systemMessages.length > 0) {
                            const systemText = systemMessages.join('\n\n');
                            content = `<system>\n${systemText}\n</system>\n\n${content}`;
                        }
                    }

                    claudeMessages.push({
                        role: "user",
                        content: content
                    });
                }
            } else if (message.role === 'assistant') {
                // Handle assistant messages - could be text or tool use
                if ((message as BaseTextMessage).text) {
                    // Simple text message
                    claudeMessages.push({
                        role: "assistant",
                        content: (message as BaseTextMessage).text
                    });
                } else if ((message as BaseToolCall).functionCall) {
                    // Store the assistant tool use message
                    const toolCall = (message as BaseToolCall).functionCall;
                    const toolUseContent: Anthropic.Messages.ContentBlock[] = [{
                        type: "tool_use",
                        id: toolCall.id,
                        name: toolCall.name,
                        input: toolCall.args
                    }];

                    claudeMessages.push({
                        role: "assistant",
                        content: toolUseContent
                    });
                }
            } else if (message.role === 'function' && (message as BaseToolResponse).functionResponse) {
                // Handle tool responses - match them with their preceding tool use
                const toolResponse = (message as BaseToolResponse).functionResponse;

                // Only add tool result if we found the matching tool use
                claudeMessages.push({
                    role: "user",
                    content: [{
                        type: "tool_result",
                        tool_use_id: toolResponse.id,
                        content: toolResponse.response
                    }]
                });
            }
        }

        return claudeMessages;
    }

    //this will only ever handle generated messages, not user messages
    //so theres no need to handle system messages
    convertMessagesFromClaude(messages: Anthropic.Messages.MessageParam[], toolNameMap: Map<string, string>): BaseMessage[] {
        const baseMessages: BaseMessage[] = [];

        for (const message of messages) {
            if (message.role === "assistant") {
                // Check for tool use blocks
                if (Array.isArray(message.content)) {
                    for (const content of message.content) {
                        if (content.type === "tool_use") {
                            baseMessages.push({
                                role: "assistant",
                                functionCall: {
                                    id: content.id,
                                    name: content.name,
                                    args: content.input
                                }
                            });
                        } else if (content.type === "text") {
                            baseMessages.push({
                                role: "assistant",
                                text: content.text
                            });
                        }
                    }
                } else {
                    // Handle regular text message with string content
                    baseMessages.push({
                        role: "assistant",
                        text: message.content as string
                    });
                }
            }
            else if (message.role === "user") {
                // Extract text content from user message
                if (Array.isArray(message.content)) {
                    for (const content of message.content) {
                        if (content.type === "tool_result") {
                            baseMessages.push({
                                role: "function",
                                functionResponse: {
                                    id: content.tool_use_id,
                                    name: toolNameMap.get(content.tool_use_id) || "",
                                    response: content.content
                                }
                            });
                        } else if (content.type === "text") {
                            baseMessages.push({
                                role: "user",
                                text: content.text
                            });
                        }
                    }
                } else {
                    baseMessages.push({
                        role: "user",
                        text: message.content as string
                    });
                }
            }
        }

        return baseMessages;
    }

    parseZodObject(zodObject: any): any {
        if (zodObject.typeName == "ZodObject") {
            let object: any = {
                type: "object",
                properties: {},
                required: []
            };

            let shape = zodObject.shape();

            for (let key in shape) {
                let optional = false;
                let type = shape[key]._def.typeName;
                let innerDef = shape[key]._def;
                let hasDefault = false;

                // Check for default value
                if (shape[key]._def.defaultValue !== undefined) {
                    hasDefault = true;
                }

                // Handle ZodDefault type
                if (type === "ZodDefault") {
                    hasDefault = true;
                    // Get the inner type
                    type = shape[key]._def.innerType._def.typeName;
                    innerDef = shape[key]._def.innerType._def;
                }

                if (type == "ZodOptional") {
                    optional = true;
                    type = shape[key]._def.innerType._def.typeName;
                    innerDef = shape[key]._def.innerType._def;

                    // Check for default in inner type
                    if (shape[key]._def.innerType._def.defaultValue !== undefined) {
                        hasDefault = true;
                    }

                    // Handle ZodDefault inside ZodOptional
                    if (type === "ZodDefault") {
                        hasDefault = true;
                        type = shape[key]._def.innerType._def.innerType._def.typeName;
                        innerDef = shape[key]._def.innerType._def.innerType._def;
                    }
                }

                object.properties[key] = {};

                if (type == "ZodString") {
                    object.properties[key].type = "string";
                }

                if (type == "ZodNumber") {
                    object.properties[key].type = "number";
                }

                if (type == "ZodBoolean") {
                    object.properties[key].type = "boolean";
                }

                if (type == "ZodObject") {
                    object.properties[key] = this.parseZodObject(shape[key]._def.optional ? shape[key]._def.innerType._def : shape[key]._def);
                    // Ensure the type property is set for nested objects
                    if (!object.properties[key].type) {
                        object.properties[key].type = "object";
                    }
                }

                if (type == "ZodArray") {
                    object.properties[key].type = "array";
                    // For arrays, we should specify items type if possible
                    const arrayType = shape[key]._def.type?._def?.typeName;
                    if (arrayType) {
                        object.properties[key].items = { type: this.zodTypeToSchemaType(arrayType) };
                    }
                }

                // Special handling for z.enum()
                if (type == "ZodNativeEnum" || type == "ZodEnum") {
                    object.properties[key].type = "string";
                    // Add enum values
                    if (type == "ZodEnum") {
                        // For z.enum(), the values are directly in the _def.values array
                        const enumValues = innerDef.values;
                        if (Array.isArray(enumValues)) {
                            object.properties[key].enum = enumValues;
                        }
                    } else if (type == "ZodNativeEnum") {
                        // For native enums, extract the values
                        const enumValues = Object.values(innerDef.values)
                            .filter(v => typeof v === 'string');
                        object.properties[key].enum = enumValues;
                    }
                }

                // Special handling for properties named "type" - ensure it has a type
                if (key === "type" && !object.properties[key].type) {
                    object.properties[key].type = "string";
                }

                // Ensure all properties have a type
                if (!object.properties[key].type) {
                    // Default to string if we can't determine the type
                    object.properties[key].type = "string";
                }

                //add description
                if (shape[key]._def.description) {
                    object.properties[key].description = shape[key]._def.description;
                } else if (type === "ZodOptional" && shape[key]._def.innerType._def.description) {
                    object.properties[key].description = shape[key]._def.innerType._def.description;
                }

                if (!optional && !hasDefault) {
                    object.required.push(key);
                }
            }

            return object;
        }
    }

    convertToolForClaude(name: string, zodTool: BaseTool): Anthropic.Messages.Tool {
        let toolDefinition: Anthropic.Messages.Tool = {
            name: name,
            description: zodTool.description,
            input_schema: this.parseZodObject(zodTool.parameters._def)
        };

        // Ensure all properties have a type specified
        this.validateParameterTypes(toolDefinition.input_schema);

        return toolDefinition;
    }

    // Recursively validate and fix parameter types
    validateParameterTypes(schema: any): void {
        if (!schema || typeof schema !== 'object') return;

        // Ensure the schema itself has a type
        if (!schema.type && schema.properties) {
            schema.type = "object";
        }

        // Check properties
        if (schema.properties) {
            for (const key in schema.properties) {
                const prop = schema.properties[key];

                // Ensure each property has a type
                if (!prop.type) {
                    prop.type = "string"; // Default to string if type is missing
                }

                // Special handling for properties named "type"
                if (key === "type" && !prop.type) {
                    prop.type = "string";
                }

                // Recursively validate nested objects
                if (prop.properties) {
                    this.validateParameterTypes(prop);
                }

                // For arrays, ensure items have types
                if (prop.type === "array" && !prop.items) {
                    prop.items = { type: "string" };
                }
            }
        }
    }

    // Helper method to convert Zod types to Schema types
    zodTypeToSchemaType(zodType: string): string {
        switch (zodType) {
            case "ZodString": return "string";
            case "ZodNumber": return "number";
            case "ZodBoolean": return "boolean";
            case "ZodObject": return "object";
            case "ZodArray": return "array";
            case "ZodEnum": return "string";
            case "ZodNativeEnum": return "string";
            case "ZodDefault": return "string"; // Default to string, but should be overridden
            default: return "string"; // Default fallback
        }
    }

    override async generateText(options: GenerateTextOptions): Promise<generateTextReturn> {
        let addedMessages: Anthropic.Messages.MessageParam[] = [];
        const maxRoundtrips = options.maxToolRoundtrips || 5;
        const toolNameMap = new Map<string, string>();

        // Convert messages to Claude format with proper tool use/result pairing
        const claudeMessages = this.convertMessagesForClaude(options.messages);

        // Rough estimation of input token count to check against rate limits
        const estimatedInputTokens = claudeMessages.reduce((total, msg) => {
            // Very rough token estimation (4 chars ~= 1 token)
            const content = typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content);
            return total + Math.ceil(content.length / 4);
        }, 1000); // Add 1000 as base cost

        try {
            // Check rate limits proactively
            await this.checkRateLimits(estimatedInputTokens);

            // Prepare Claude tools
            const claudeTools: Anthropic.Messages.Tool[] = [];
            if (options.tools) {
                for (const key in options.tools) {
                    const toolDefinition = this.convertToolForClaude(key, options.tools[key]);
                    claudeTools.push(toolDefinition);
                }
            }

            // Maintain a proper conversation state with tool use/result pairs
            let rounds = 0;
            let runAgain = true;

            let forceStop = false;

            while (rounds < maxRoundtrips) {
                if (options.stopSignal && options.stopSignal.isSet()) {
                    break;
                }

                // Call Claude API with retry mechanism for rate limits
                let response: Anthropic.Messages.Message | undefined;
                const maxRetries = 3;
                let retryCount = 0;
                let retryDelay = 2000; // Start with 2 seconds

                while (retryCount <= maxRetries) {
                    try {
                        response = await this.provider.messages.create({
                            model: this.modelID,
                            messages: claudeMessages,
                            max_tokens: this.maxTokens || 4096,
                            tools: claudeTools,
                            tool_choice: options.toolChoice == "required" ? { type: "any" } : { type: "auto" }
                        });

                        // Update rate limit info from successful response
                        if (response.usage?.input_tokens) {
                            // Adjust remaining tokens based on actual usage
                            ClaudeModel.rateLimitInfo.remainingTokens -= response.usage.input_tokens;
                        }

                        // Success, break out of retry loop
                        break;
                    } catch (error: any) {
                        // Check if this is a rate limit error
                        if (error.status === 429) {
                            // Update rate limit info from error response headers
                            this.updateRateLimitInfo(error.headers);

                            retryCount++;

                            // If we've reached max retries, throw the error
                            if (retryCount > maxRetries) {
                                throw error;
                            }

                            // Get retry-after header or use exponential backoff
                            let waitTime = error.headers?.['retry-after']
                                ? parseInt(error.headers['retry-after']) * 1000
                                : retryDelay;

                            console.log(`Rate limit hit. Waiting ${waitTime / 1000} seconds before retry ${retryCount}/${maxRetries}`);

                            // Wait for the specified time
                            await new Promise(resolve => setTimeout(resolve, waitTime));

                            // Exponential backoff for next retry if needed
                            retryDelay *= 2;
                        } else {
                            // Not a rate limit error, throw it
                            throw error;
                        }
                    }
                }

                // If after all retries we still don't have a response, throw an error
                if (!response) {
                    throw new Error("Failed to get response from Claude API after multiple retries");
                }

                const cleanedResponse: Anthropic.Messages.MessageParam = {
                    role: response.role,
                    content: response.content
                };

                claudeMessages.push(cleanedResponse);
                addedMessages.push(cleanedResponse);

                runAgain = false;

                //check if message is a text message
                if (typeof cleanedResponse.content === "string") {
                    if (options.textMessageGenerated) {
                        await options.textMessageGenerated({
                            role: "assistant",
                            text: cleanedResponse.content
                        });
                    }
                } else if (Array.isArray(cleanedResponse.content)) {
                    for (const content of cleanedResponse.content) {
                        if (content.type === "text") {
                            if (options.textMessageGenerated) {
                                await options.textMessageGenerated({
                                    role: "assistant",
                                    text: content.text
                                });
                            }
                        }
                    }
                }

                // Check for tool use in the response
                if (Array.isArray(cleanedResponse.content)) {
                    const toolUses = cleanedResponse.content.filter(
                        (content: any) => content.type === "tool_use"
                    );

                    // Process each tool use
                    for (const toolUse of toolUses) {
                        if (toolUse.type !== "tool_use") continue;

                        // Execute the tool
                        if (options.tools && options.tools[toolUse.name]) {
                            const tool = options.tools[toolUse.name];
                            const toolOptions: BaseToolOptions = {
                                forceStop: false
                            };

                            // if we are using a tool, we need to run again
                            runAgain = true;

                            toolNameMap.set(toolUse.id, toolUse.name);

                            const toolResponse = await tool.execute(toolUse.input, toolOptions);

                            if (toolOptions.forceStop) {
                                forceStop = true;
                            }

                            // Add tool result to messages for next round
                            const toolResultMessage: Anthropic.Messages.MessageParam = {
                                role: "user",
                                content: [{
                                    type: "tool_result",
                                    tool_use_id: toolUse.id,
                                    content: toolResponse !== null ? JSON.stringify(toolResponse) : ""
                                }]
                            };

                            claudeMessages.push(toolResultMessage);
                            addedMessages.push(toolResultMessage);
                        }
                        else {
                            // tell claude that the tool was not found
                            const toolResultMessage: Anthropic.Messages.MessageParam = {
                                role: "user",
                                content: [{
                                    type: "tool_result",
                                    tool_use_id: toolUse.id,
                                    content: "Tool not found"
                                }]
                            };

                            claudeMessages.push(toolResultMessage);
                            addedMessages.push(toolResultMessage);

                            console.error(`[CLAUDE DEBUG] Tool ${toolUse.name} not found`);
                        }
                    }

                    // Continue conversation if we processed tools
                    rounds++;

                    //if a tool requested a stop, we don't need to run again
                    if (forceStop) {
                        runAgain = false;
                    }
                }

                // if we don't need to run again, we can break
                if (!runAgain) {
                    break;
                }
            }

            // // Extract final text from the last message
            // let finalText = "";
            // const lastMessage = addedMessages[addedMessages.length - 1];

            // if (typeof lastMessage.content === "string") {
            //     finalText = lastMessage.content;
            // } else if (Array.isArray(lastMessage.content)) {
            //     finalText = lastMessage.content
            //         .filter((content: any) => content.type === "text")
            //         .map((content: any) => content.text)
            //         .join("\n");
            // }

            // Convert Claude messages back to our format
            const processedMessages = this.convertMessagesFromClaude(addedMessages, toolNameMap);

            let text = null;

            if (addedMessages.length > 0) {
                if(typeof addedMessages[addedMessages.length - 1].content === "string") {
                    text = addedMessages[addedMessages.length - 1].content;
                } else if (Array.isArray(addedMessages[addedMessages.length - 1].content)) {
                    text = (addedMessages[addedMessages.length - 1].content as Anthropic.Messages.ContentBlock[]).find((content: Anthropic.Messages.ContentBlock) => content.type === "text")?.text || "";
                }
            }

            return {
                addedMessages: processedMessages,
                text: typeof text === 'string' ? text : ''
            };
        } catch (error: any) {
            console.log(claudeMessages);

            console.error("Error calling Claude API:", error);
            return {
                addedMessages: [],
                text: `Error: ${error}`
            };
        }
    }
}

type createClaudeProviderParams = {
    apiKey?: string,
    baseURL?: string
};

export function createClaudeProvider(options: createClaudeProviderParams) {
    const anthropicProvider = new Anthropic({
        apiKey: options.apiKey,
        baseURL: options.baseURL
    });

    return function (model: ClaudeModelId, maxTokens?: number) {
        return new ClaudeModel(anthropicProvider, model, maxTokens);
    };
} 