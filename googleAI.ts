import {Content, FunctionCallingConfigMode, FunctionDeclaration, GenerateContentConfig, GoogleGenAI, HarmBlockThreshold, HarmCategory} from '@google/genai';

import {BaseAudioMessage, BaseImageMessage, BaseMessage, BaseModel, BaseTextMessage, BaseTool, BaseToolCall, BaseToolOptions, BaseToolResponse, GenerateTextOptions, generateTextReturn} from './AIBase';

export type GoogleGenerativeAIModelId =
    'gemini-2.5-pro'|'gemini-2.5-flash'|'gemini-2.5-flash-lite-preview-06-17';

export type GoogleSafetySettings = Array < {category: string
    threshold: string
}>;

    type GoogleMessages = {
      systemMessage?: string, messages: Content[]
    };

    export class GoogleModel extends BaseModel {
      provider: GoogleGenAI;
      modelID: GoogleGenerativeAIModelId;
      safetySettings?: GoogleSafetySettings;

      constructor(
          provider: GoogleGenAI, model: GoogleGenerativeAIModelId,
          safetySettings?: GoogleSafetySettings) {
        super();

        this.provider = provider;
        this.modelID = model;
        this.safetySettings = safetySettings;
      }

      convertMessagesForGoogle(messages: BaseMessage[]): GoogleMessages {
        // check if first message is a system message
        let systemMessage = undefined;
        let googleMessages: any[] = [];

        if (messages[0].role == 'system') {
          systemMessage = messages[0].text;
        }

        for (let message of messages) {
          // check if text property exists
          if ((message as BaseTextMessage).text && message.role != 'system') {
            googleMessages.push({
              role: message.role == 'user' ? 'user' : 'model',
              parts: [{text: (message as any).text}]
            });
          }
          // check if image property exists
          else if (
              (message as BaseImageMessage).content &&
              (message as BaseImageMessage).content[0].type == 'image_url') {
            const imageContents: any[] = [];

            // we have to parse the header
            // rgb_image_url: `data:image/jpeg;base64,${this.rgbBase64}`,
            // into
            /*
            {
                "inlineData": {
                    "data": "/9j/4AAQSkZJRg...",
                    "mimeType": "image/jpeg"
                }
            },
             */
            for (const content of (message as BaseImageMessage).content) {
              // we have to parse the header
              const url = content.image_url.url;
              const header = url.substring(0, url.indexOf(','));
              const excludeData = header.substring(header.indexOf(':') + 1);
              const mediaType =
                  excludeData.substring(0, excludeData.indexOf(';'));
              // const base64 = excludeData.substring(excludeData.indexOf(";") +
              // 1);
              const payload = url.substring(url.indexOf(',') + 1);

              imageContents.push(
                  {inlineData: {data: payload, mimeType: mediaType}});
            }

            googleMessages.push({
              role: message.role == 'user' ? 'user' : 'model',
              parts: imageContents
            });
          } else if (
              (message as BaseAudioMessage).content &&
              (message as BaseAudioMessage).content[0].type == 'audio_url') {
            googleMessages.push({
              role: message.role == 'user' ? 'user' : 'model',
              parts: [{
                inlineData: {
                  mimeType: (message as BaseAudioMessage)
                                .content[0]
                                .audio_url.mime_type,
                  data: (message as BaseAudioMessage).content[0].audio_url.data
                }
              }]
            });
          } else if ((message as BaseToolCall).functionCall) {
            googleMessages.push({
              role: 'model',
              parts: [{
                functionCall: {
                  name: (message as BaseToolCall).functionCall.name,
                  args: (message as BaseToolCall).functionCall.args
                }
              }]
            });
          } else if ((message as BaseToolResponse).functionResponse) {
            googleMessages.push({
              role: 'function',
              parts: [{
                functionResponse: {
                  name: (message as BaseToolResponse).functionResponse.name,
                  response: {
                    name: (message as BaseToolResponse).functionResponse.name,
                    content:
                        (message as BaseToolResponse).functionResponse.response
                  }
                }
              }]
            });
          }
        }

        return {
          systemMessage: systemMessage, messages: googleMessages
        }
      }

      convertMessagesFromGoogle(toolCallIDs: Map<any, string>, messages: any[]):
          BaseMessage[] {
        let baseMessages: BaseMessage[] = [];

        for (let message of messages) {
          // check if text property exists
          if (message.parts[0].text) {
            baseMessages.push({
              role: message.role == 'user' ? 'user' : 'assistant',
              text: message.parts[0].text
            });
          }
          // check if function call property exists
          else if (message.parts[0].functionCall) {
            baseMessages.push({
              role: 'assistant',
              functionCall: {
                id: toolCallIDs.get(message) || '',
                name: message.parts[0].functionCall.name,
                args: message.parts[0].functionCall.args
              }
            });
          }
          // check if function response
          else if (message.role == 'function') {
            baseMessages.push({
              role: 'function',
              functionResponse: {
                id: toolCallIDs.get(message) || '',
                name: message.parts[0].functionResponse?.name || '',
                response: (message.parts[0].functionResponse?.response as any)
                              ?.content ||
                    {}
              }
            });
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
                // For z.enum(), the values are directly in the _def.values
                // array
                const enumValues = innerDef.values;
                if (Array.isArray(enumValues)) {
                  object.properties[key].enum = enumValues;
                  // console.log(`Enum values for ${key}:`, enumValues);
                }
              } else if (type == 'ZodNativeEnum') {
                // For native enums, extract the values
                const enumValues = Object.values(innerDef.values)
                                       .filter(v => typeof v === 'string');
                object.properties[key].enum = enumValues;
              }
            }

            // Special handling for properties named "type" - Google API
            // requires this
            if (key === 'type' && !object.properties[key].type) {
              object.properties[key].type = 'string';
              // console.log("Added missing type field to 'type' property in
              // parseZodObject");
            }

            // Ensure all properties have a type
            if (!object.properties[key].type) {
              // Default to string if we can't determine the type
              object.properties[key].type = 'string';
              // console.log(`Added missing type field to '${key}' property`);
            }

            // Add default value if present
            if (hasDefault) {
              // We don't actually need to set the default in the schema
              // Just noting that it has a default so it's not required
              optional = true;
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

      convertToolCallForGoogle(name: string, zodTool: BaseTool): any {
        let functionDeclaration: any = {
          name: name,
          description: zodTool.description,
        };

        functionDeclaration.parameters =
            this.parseZodObject(zodTool.parameters._def);

        // Ensure all properties have a type specified, especially if there's a
        // property named 'type'
        this.validateParameterTypes(functionDeclaration.parameters);

        // Debug log the final schema
        // console.log(`Final schema for tool ${name}:`,
        // JSON.stringify(functionDeclaration.parameters, null, 2));

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
          if (Object.keys(schema.properties).length == 0) {
            // insert dummy property
            schema.properties = {
              dummy: {type: 'string', description: 'unused'}
            };
          }

          for (const key in schema.properties) {
            const prop = schema.properties[key];

            // Ensure each property has a type
            if (!prop.type) {
              prop.type = 'string';  // Default to string if type is missing
            }

            // Special handling for properties named "type" - Google API
            // requires this
            if (key === 'type' && !prop.type) {
              prop.type = 'string';
              // console.log("Added missing type field to 'type' property");
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

      generateToolCallID() {
        // example call_1LeGZsz1NlbcyGAJUsbXwOci
        let length = '1LeGZsz1NlbcyGAJUsbXwOci'.length;

        let characters =
            '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

        let result = '';
        for (let i = 0; i < length; i++) {
          const randomIndex = Math.floor(Math.random() * characters.length);
          result += characters[randomIndex];
        }

        return 'call_' + result;
      }

      override async generateText(options: GenerateTextOptions):
          Promise<generateTextReturn> {
        let roundtrips = 0;
        let addedMessages: Content[] = [];
        let functionCallIDs: Map<Content, string> = new Map();

        let {systemMessage, messages: googleMessages} =
            this.convertMessagesForGoogle(options.messages || []);

        let googleTools: FunctionDeclaration[] = [];

        // convert tools to function declarations
        if (options.tools) {
          for (let key in options.tools) {
            let tool = options.tools[key];
            let functionDeclaration = this.convertToolCallForGoogle(key, tool);

            googleTools.push(functionDeclaration);
          }
        }

        // Prepare the generate content request - using new API structure
        const contents = googleMessages;

        // Prepare config for the new API
        const config: GenerateContentConfig = {};

        // Add system instruction if available
        if (systemMessage) {
          config.systemInstruction = {
            role: 'user',
            parts: [{text: systemMessage}]
          };
        }

        // Add tools if available
        if (googleTools.length > 0) {
          config.tools = [{functionDeclarations: googleTools}];

          // determine function calling mode
          let functionCallingMode = undefined;
          if (options.toolChoice == 'auto') {
            functionCallingMode = FunctionCallingConfigMode.AUTO;
          } else if (options.toolChoice == 'required') {
            functionCallingMode = FunctionCallingConfigMode.ANY;
          } else if (options.toolChoice == 'none') {
            functionCallingMode = FunctionCallingConfigMode.NONE;
          }

          config.toolConfig = {
            functionCallingConfig: {mode: functionCallingMode}
          };
        }

        // Add safety settings if available
        if (this.safetySettings) {
          config.safetySettings = this.safetySettings.map(
              setting => ({
                category: setting.category as HarmCategory,
                threshold: setting.threshold as HarmBlockThreshold
              }));
        }

        while (roundtrips <= (options.maxToolRoundtrips || 5)) {
          let runAgain = false;

          if (options.stopSignal && options.stopSignal.isSet()) {
            break;
          }

          try {
            // Use new API: provider.models.generateContent()
            const response = await this.provider.models.generateContent(
                {model: this.modelID, contents: contents, config: config});

            // Process response from the new API structure
            if (response.candidates && response.candidates[0] &&
                response.candidates[0].content) {
              const candidate = response.candidates[0];
              const content = candidate.content;

              if (content) {
                // Add response to google messages
                contents.push(content);

                // Process all parts in the response
                let textParts: string[] = [];
                let functionCalls: any[] = [];

                if (content.parts) {
                  for (const part of content.parts) {
                    if (part.text) {
                      textParts.push(part.text);
                    } else if (part.functionCall) {
                      functionCalls.push(part.functionCall);
                    }
                  }
                }

                // Handle text parts
                if (textParts.length > 0) {
                  const fullText = textParts.join('');
                  console.log(fullText);

                  if (options.textMessageGenerated) {
                    await options.textMessageGenerated(
                        {role: 'assistant', text: fullText});
                  }

                  addedMessages.push(
                      {role: 'model', parts: [{text: fullText}]});
                }

                // Handle function calls
                if (functionCalls.length > 0) {
                  let forceStop = false;

                  for (let call of functionCalls) {
                    // add tool call to added messages
                    let toolCallMessage = {
                      role: 'model',
                      parts:
                          [{functionCall: {name: call.name, args: call.args}}]
                    }

                                          addedMessages.push(toolCallMessage);

                    // generate toolCallID
                    let id = this.generateToolCallID();
                    functionCallIDs.set(toolCallMessage, id);

                    let toolResponse = null;

                    const toolOptions: BaseToolOptions = {forceStop: false};

                    // check if tool exists
                    if (call.name && options.tools?.[call.name]) {
                      toolResponse = await options.tools[call.name].execute(
                          call.args, toolOptions);
                    }

                    if (toolOptions.forceStop) {
                      forceStop = true;
                    }

                    let toolResponseMessage = {
                      role: 'function',
                      parts: [{
                        functionResponse: {
                          name: call.name,
                          response: {name: call.name, content: toolResponse}
                        }
                      }]
                    }

                                              functionCallIDs.set(
                                                  toolResponseMessage, id);

                    addedMessages.push(toolResponseMessage);
                    contents.push(toolResponseMessage);
                  }

                  if (forceStop) {
                    break;
                  }

                  roundtrips++;
                  runAgain = true;
                }
              }
            }

            if (!runAgain) {
              break;
            }
          } catch (error) {
            console.error('Error generating content:', error);
            throw error;
          }
        }

        let text = null;

        if (addedMessages.length > 0) {
          const lastMessage = addedMessages[addedMessages.length - 1];
          text = lastMessage.parts?.[0]?.text || null;
        }

        return {
          addedMessages: this.convertMessagesFromGoogle(
              functionCallIDs, addedMessages),
              text: text || ''
        }
      }
    }

    export function createGoogleProvider(apiKey: string) {
      let googleAI = new GoogleGenAI({apiKey});
      return function(
          model: GoogleGenerativeAIModelId,
          safetySettings?: GoogleSafetySettings) {
        return new GoogleModel(googleAI, model, safetySettings);
      }
    }