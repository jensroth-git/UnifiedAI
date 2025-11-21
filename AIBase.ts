import { z } from "zod";

export class Signal {
    constructor(private _value: boolean = false) 
    {  }

    set() { this._value = true; }
    clear() { 
        this._value = false; 
        // Resolve any pending promises when signal is cleared
        if (this._resolver) {
            this._resolver();
            this._resolver = undefined;
        }
    }
    isSet() { return this._value; }

    private _resolver?: () => void;

    waitUntilReset(): Promise<void> {
        // If signal is already cleared, resolve immediately
        if (!this.isSet()) {
            return Promise.resolve();
        }
        
        // Otherwise create a new promise that will resolve when clear() is called
        return new Promise<void>((resolve) => {
            this._resolver = resolve;
        });
    }
}

export class BaseModel {
    async generateText(options: GenerateTextOptions): Promise<generateTextReturn> {
        throw new Error("Not implemented");
    }
}

export type generateTextReturn = {
    addedMessages: BaseMessage[],
    text: string
};

export type BaseSystemMessage = {
    role: "system",
    text: string
};

export type BaseTextMessage = {
    role: "user" | "assistant",
    text: string,
    thoughtSignature?: string
};

export type BaseImageMessage = {
    role: "user",
    content: {
        type: "image_url",
        image_url: {
            url: string,
            detail?: "auto" | "high" | "low"
        }
    }[]
};

export type BaseAudioMessage = {
    role: "user",
    content: {
        type: "audio_url",
        audio_url: {
            mime_type: string,
            data: string
        }
    }[]
};

export type BaseVideoMessage = {
    role: "user",
    content: {
        type: "video_url",
        video_url: {
            mime_type: string,
            data: string
        }
    }[]
};

export type BaseToolCall = {
    role: "assistant",
    functionCall: {
        id: string,
        name: string,
        args: any
    },
    thoughtSignature?: string
};

export type BaseToolResponse = {
    role: "function",
    functionResponse: {
        id: string,
        name: string,
        response: any
    }
};

export type BaseMessage = BaseSystemMessage | BaseTextMessage | BaseImageMessage | BaseAudioMessage | BaseVideoMessage | BaseToolCall | BaseToolResponse;

export type BaseToolOptions = {
    forceStop?: boolean
}

export type BaseTool = {
    description: string,
    parameters: z.AnyZodObject,
    execute: (args: any, options: BaseToolOptions) => any,
}

export type GenerateTextOptions = {
    model: BaseModel,
    messages?: BaseMessage[],
    maxToolRoundtrips?: number,
    tools?: Record<string, BaseTool>,
    toolChoice?: "auto" | "none" | "required",
    thinking?: boolean,
    stopSignal?: Signal,
    textMessageGenerated?: (message: BaseTextMessage) => Promise<void>
}

export async function generateText(options: GenerateTextOptions): Promise<generateTextReturn> {
    return options.model.generateText(options);
}