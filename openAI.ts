import OpenAI from 'openai';
import {ChatCompletionAssistantMessageParam, ChatCompletionMessageFunctionToolCall, ChatCompletionMessageToolCall, ChatCompletionToolMessageParam, ChatModel} from 'openai/resources';

import {BaseImageMessage, BaseMessage, BaseModel, BaseSystemMessage, BaseTextMessage, BaseTool, BaseToolCall, BaseToolOptions, BaseToolResponse, GenerateTextOptions, generateTextReturn} from './AIBase';

export type OpenAIModelId = ChatModel|(string&{})

export class OpenAIModel extends BaseModel {
  provider: OpenAI;
  modelID: OpenAIModelId;

  constructor(provider: OpenAI, model: OpenAIModelId) {
    super();

    this.provider = provider;
    this.modelID = model;
  }

  convertMessagesForOpenAI(messages?: BaseMessage[]):
      OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    let openAImessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        [];

    if (!messages) {
      return openAImessages;
    }

    for (let message of messages) {
      // check for system message
      if ((message as BaseSystemMessage).text && message.role == 'system') {
        openAImessages.push({
          role: this.modelID.startsWith('o') ? 'developer' : 'system',
          content: (message as BaseSystemMessage).text
        });
      }
      // check if text property exists
      else if ((message as BaseTextMessage).text) {
        openAImessages.push({
          role: (message as BaseTextMessage).role,
          content: (message as BaseTextMessage).text
        });
      } else if ((message as BaseImageMessage).content) {
        openAImessages.push({
          role: (message as BaseImageMessage).role,
          content: (message as BaseImageMessage).content
        });
      } else if ((message as BaseToolCall).functionCall) {
        openAImessages.push({
          role: 'assistant',
          tool_calls: [{
            type: 'function',
            id: (message as BaseToolCall).functionCall.id,
            function: {
              name: (message as BaseToolCall).functionCall.name,
              arguments:
                  JSON.stringify((message as BaseToolCall).functionCall.args)
            }
          }]
        });
      } else if ((message as BaseToolResponse).functionResponse) {
        openAImessages.push({
          role: 'tool',
          tool_call_id: (message as BaseToolResponse).functionResponse.id,
          content: JSON.stringify(
              (message as BaseToolResponse).functionResponse.response)
        });
      }
    }

    return openAImessages;
  }

  convertMessagesFromOpenAI(
      addedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]):
      BaseMessage[] {
    let baseMessages: BaseMessage[] = [];

    for (let message of addedMessages) {
      if (message.role == 'developer') {
        baseMessages.push({role: 'system', text: message.content as string});
      }

      // check if text property exists
      if (message.role == 'assistant' && !message.tool_calls) {
        baseMessages.push({role: 'assistant', text: message.content as string});
      }
      // check if function call property exists
      else if (
          (message as ChatCompletionAssistantMessageParam).tool_calls &&
          (message as ChatCompletionAssistantMessageParam).tool_calls!.length >
              0) {
        const assistantMessage = message as ChatCompletionAssistantMessageParam;
        if (assistantMessage.tool_calls &&
            Array.isArray(assistantMessage.tool_calls) &&
            assistantMessage.tool_calls.length > 0 &&
            assistantMessage.tool_calls[0]) {
          const toolCall =
              assistantMessage.tool_calls[0] as ChatCompletionMessageToolCall;
          if (toolCall.type === 'function') {
            const functionCall =
                toolCall as ChatCompletionMessageFunctionToolCall;
            baseMessages.push({
              role: 'assistant',
              functionCall: {
                id: functionCall.id,
                name: functionCall.function.name,
                args: JSON.parse(functionCall.function.arguments),
              }
            });
          }
        }
      }
      // check if function response
      else if (message.role == 'tool') {
        const toolMessage = message as ChatCompletionToolMessageParam;

        // find name of tool with that id
        const assistantMessage = addedMessages.find((historyMessage) => {
          return historyMessage.role == 'assistant' &&
              (historyMessage as ChatCompletionAssistantMessageParam)
                  .tool_calls?.some(
                      call => call.id === toolMessage.tool_call_id);
        }) as ChatCompletionAssistantMessageParam |
            undefined;

        if (!assistantMessage || !assistantMessage.tool_calls?.[0]) {
          console.error('Tool call not found in history');
          continue;
        }
        const toolCall =
            assistantMessage.tool_calls[0] as ChatCompletionMessageToolCall;
        if (toolCall.type === 'function') {
          const functionCall =
              toolCall as ChatCompletionMessageFunctionToolCall;
          try {
            const functionResponse = JSON.parse(toolMessage.content as string);

            baseMessages.push({
              role: 'function',
              functionResponse: {
                id: toolMessage.tool_call_id || '',
                name: functionCall.function.name,
                response: functionResponse
              }
            });
          } catch (error) {
            console.log(toolMessage.content);
            console.error('Error parsing function response:', error);
          }
        }
      }
    }

    return baseMessages;
  }

  // parse zod _def
  parseZodObject(zodObject: any): any {
    if (zodObject.typeName == 'ZodObject') {
      let object: any = {type: 'object', properties: {}, required: []};

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
        if (type === 'ZodDefault') {
          hasDefault = true;
          // Get the inner type
          type = shape[key]._def.innerType._def.typeName;
          innerDef = shape[key]._def.innerType._def;
        }

        if (type == 'ZodOptional') {
          optional = true;
          type = shape[key]._def.innerType._def.typeName;
          innerDef = shape[key]._def.innerType._def;

          // Check for default in inner type
          if (shape[key]._def.innerType._def.defaultValue !== undefined) {
            hasDefault = true;
          }

          // Handle ZodDefault inside ZodOptional
          if (type === 'ZodDefault') {
            hasDefault = true;
            type = shape[key]._def.innerType._def.innerType._def.typeName;
            innerDef = shape[key]._def.innerType._def.innerType._def;
          }
        }

        object.properties[key] = {};

        if (type == 'ZodString') {
          object.properties[key].type = 'string';
        }

        if (type == 'ZodNumber') {
          object.properties[key].type = 'number';
        }

        if (type == 'ZodBoolean') {
          object.properties[key].type = 'boolean';
        }

        if (type == 'ZodObject') {
          object.properties[key] = this.parseZodObject(
              shape[key]._def.optional ? shape[key]._def.innerType._def :
                                         shape[key]._def);
          // Ensure the type property is set for nested objects
          if (!object.properties[key].type) {
            object.properties[key].type = 'object';
          }
        }

        if (type == 'ZodArray') {
          object.properties[key].type = 'array';
          // For arrays, we should specify items type if possible
          const arrayType = shape[key]._def.type?._def?.typeName;
          if (arrayType) {
            object.properties[key].items = {
              type: this.zodTypeToSchemaType(arrayType)
            };
          }
        }

        // Special handling for z.enum()
        if (type == 'ZodNativeEnum' || type == 'ZodEnum') {
          object.properties[key].type = 'string';
          // Add enum values
          if (type == 'ZodEnum') {
            // For z.enum(), the values are directly in the _def.values array
            const enumValues = innerDef.values;
            if (Array.isArray(enumValues)) {
              object.properties[key].enum = enumValues;
            }
          } else if (type == 'ZodNativeEnum') {
            // For native enums, extract the values
            const enumValues = Object.values(innerDef.values)
                                   .filter(v => typeof v === 'string');
            object.properties[key].enum = enumValues;
          }
        }

        // Special handling for properties named "type" - ensure it has a type
        if (key === 'type' && !object.properties[key].type) {
          object.properties[key].type = 'string';
        }

        // Ensure all properties have a type
        if (!object.properties[key].type) {
          // Default to string if we can't determine the type
          object.properties[key].type = 'string';
        }

        // add description
        if (shape[key]._def.description) {
          object.properties[key].description = shape[key]._def.description;
        } else if (
            type === 'ZodOptional' &&
            shape[key]._def.innerType._def.description) {
          object.properties[key].description =
              shape[key]._def.innerType._def.description;
        }

        if (!optional && !hasDefault) {
          object.required.push(key);
        }
      }

      return object;
    }
  }

  convertToolCallForOpenAI(name: string, zodTool: BaseTool):
      OpenAI.Chat.Completions.ChatCompletionTool {
    let functionDeclaration: OpenAI.Chat.Completions.ChatCompletionTool = {
      type: 'function',
      function: {
        name: name,
        description: zodTool.description,
      }
    };

    functionDeclaration.function.parameters =
        this.parseZodObject(zodTool.parameters._def);

    // Ensure all properties have a type specified
    this.validateParameterTypes(functionDeclaration.function.parameters);

    return functionDeclaration;
  }

  // Recursively validate and fix parameter types
  validateParameterTypes(schema: any): void {
    if (!schema || typeof schema !== 'object') return;

    // Ensure the schema itself has a type
    if (!schema.type && schema.properties) {
      schema.type = 'object';
    }

    // Check properties
    if (schema.properties) {
      for (const key in schema.properties) {
        const prop = schema.properties[key];

        // Ensure each property has a type
        if (!prop.type) {
          prop.type = 'string';  // Default to string if type is missing
        }

        // Special handling for properties named "type"
        if (key === 'type' && !prop.type) {
          prop.type = 'string';
        }

        // Recursively validate nested objects
        if (prop.properties) {
          this.validateParameterTypes(prop);
        }

        // For arrays, ensure items have types
        if (prop.type === 'array' && !prop.items) {
          prop.items = {type: 'string'};
        }
      }
    }
  }

  override async generateText(options: GenerateTextOptions):
      Promise<generateTextReturn> {
    let roundtrips = 0;
    let addedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        [];

    // // Test schema for debugging
    // const { z } = require('zod');
    // const testSchema = z.object({
    //     x: z.number().describe("X coordinate in cm"),
    //     y: z.number().describe("Y coordinate in cm"),
    //     speed: z.number().default(100).describe("Speed of movement in cm/s"),
    //     animation: z.enum(["walk", "run",
    //     "crawl"]).default("walk").describe("Movement animation")
    // });
    // const parsedSchema = this.parseZodObject(testSchema._def);
    // console.log("OpenAI parsed schema:", JSON.stringify(parsedSchema, null,
    // 2));

    let openAIMessages = this.convertMessagesForOpenAI(options.messages);

    let openAItools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

    // convert tools to function declarations
    if (options.tools) {
      for (let key in options.tools) {
        let tool = options.tools[key];
        let functionDeclaration = this.convertToolCallForOpenAI(key, tool);

        openAItools.push(functionDeclaration);
      }
    }

    while (roundtrips <= (options.maxToolRoundtrips || 5)) {
      let runAgain = false;

      if (options.stopSignal && options.stopSignal.isSet()) {
        break;
      }

      const response = await this.provider.chat.completions.create({
        messages: openAIMessages,
        model: this.modelID,
        tools: openAItools,
        tool_choice: options.toolChoice
      });

      let message = response.choices[0].message;

      // add response to messages
      openAIMessages.push(message);

      if (message.tool_calls?.length) {
        let forceStop = false;

        for (let call of message.tool_calls) {
          // check if function call
          if (call.type === 'function') {
            const functionCall = call as ChatCompletionMessageFunctionToolCall;
            addedMessages.push({
              role: 'assistant',
              tool_calls: [{
                function: functionCall.function,
                id: functionCall.id,
                type: 'function',
              }]
            });

            let toolResponse: string|null = null;

            // check if tool exists
            if (options.tools && options.tools[functionCall.function.name]) {
              let args = JSON.parse(functionCall.function.arguments);

              const tool = options.tools[functionCall.function.name];

              const toolOptions: BaseToolOptions = {forceStop: false};

              const result = await tool.execute(args, toolOptions);
              toolResponse = JSON.stringify(result);

              if (toolOptions.forceStop) {
                forceStop = true;
              }
            }

            let toolResponseMessage: ChatCompletionToolMessageParam = {
              role: 'tool',
              tool_call_id: functionCall.id,
              content: toolResponse || '{}'
            };

            addedMessages.push(toolResponseMessage);
            openAIMessages.push(toolResponseMessage);
          }
        }

        if (forceStop) {
          break;
        }

        roundtrips++;
        runAgain = true;
      } else {
        addedMessages.push({role: 'assistant', content: message.content});

        if (options.textMessageGenerated) {
          await options.textMessageGenerated(
              {role: 'assistant', text: message.content as string});
        }
      }

      if (!runAgain) {
        break;
      }
    }

    let text = null;

    if (addedMessages.length > 0) {
      text = addedMessages[addedMessages.length - 1].content;
    }

    return {
      addedMessages: this.convertMessagesFromOpenAI(addedMessages),
          text: typeof text === 'string' ? text : ''
    }
  }

  // Helper method to convert Zod types to Schema types
  zodTypeToSchemaType(zodType: string): string {
    switch (zodType) {
      case 'ZodString':
        return 'string';
      case 'ZodNumber':
        return 'number';
      case 'ZodBoolean':
        return 'boolean';
      case 'ZodObject':
        return 'object';
      case 'ZodArray':
        return 'array';
      case 'ZodEnum':
        return 'string';
      case 'ZodNativeEnum':
        return 'string';
      case 'ZodDefault':
        return 'string';  // Default to string, but should be overridden
      default:
        return 'string';  // Default fallback
    }
  }
}

type createOpenAiProviderParams = {
  apiKey?: string,
  baseURL?: string
};

export function createOpenAIProvider(options: createOpenAiProviderParams) {
  let OpenAIprovider =
      new OpenAI({apiKey: options.apiKey, baseURL: options.baseURL});

  return function(model: OpenAIModelId) {
    return new OpenAIModel(OpenAIprovider, model);
  }
}