import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// Pricing per 1M tokens (USD) — update when MiniMax changes pricing
const MINIMAX_PRICING = {
  prompt: 0.40,      // $0.40 / 1M prompt tokens
  completion: 2.00,  // $2.00 / 1M completion tokens
};

const resolveApiUrl = (): { url: string; key: string; model: string } => {
  const minimaxKey = ENV.minimaxApiKey?.trim();
  if (minimaxKey) {
    return {
      url: `${ENV.minimaxApiUrl.replace(/\/$/, "")}/chat/completions`,
      key: minimaxKey,
      model: ENV.minimaxModel,
    };
  }
  // Fallback to legacy Forge (Manus) API
  if (!ENV.forgeApiKey) {
    throw new Error(
      "No LLM API key configured. Set MINIMAX_API_KEY (recommended) or BUILT_IN_FORGE_API_KEY."
    );
  }
  return {
    url: ENV.forgeApiUrl?.trim()
      ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
      : "https://forge.manus.im/v1/chat/completions",
    key: ENV.forgeApiKey,
    model: "gemini-2.5-flash",
  };
};

/**
 * Strip <think>...</think> reasoning blocks from MiniMax M2.7 output.
 * By default MiniMax reasoning models prepend their chain-of-thought.
 */
function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function calculateCost(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens / 1_000_000) * MINIMAX_PRICING.prompt +
    (completionTokens / 1_000_000) * MINIMAX_PRICING.completion
  );
}

export async function invokeLLM(params: InvokeParams & { userId?: number }): Promise<InvokeResult> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    userId,
  } = params;

  if (userId) {
    // Dynamic import to avoid circular dependency since llm is core
    const { getKillSwitchSettings } = await import("../db");
    const ksSettings = await getKillSwitchSettings(userId);
    if (ksSettings?.isActive) {
      throw new Error("LLM API request blocked by DevPulse Kill Switch.");
    }
  }

  const { url, key, model } = resolveApiUrl();

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
    max_tokens: params.maxTokens ?? params.max_tokens ?? 8192,
  };

  // MiniMax M2.7 is a reasoning model — enable reasoning with a token budget
  if (model === ENV.minimaxModel) {
    // MiniMax supports reasoning natively without a special parameter
    // but we can set temperature to 1 for best reasoning quality
    payload.temperature = 1;
  } else {
    // Legacy Forge params
    payload.thinking = { budget_tokens: 128 };
    payload.max_tokens = 32768;
  }

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed (${model}): ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const result = (await response.json()) as InvokeResult;

  // Strip <think> tags from MiniMax reasoning output in text content
  if (model === ENV.minimaxModel) {
    for (const choice of result.choices) {
      if (typeof choice.message.content === "string") {
        choice.message.content = stripThinkingTags(choice.message.content);
      }
    }
  }

  // ── Auto-track token usage in DevPulse analytics ─────────────────────────
  if (userId && result.usage) {
    const { prompt_tokens, completion_tokens } = result.usage;
    const costUSD = calculateCost(prompt_tokens, completion_tokens);

    // Fire-and-forget: don't block the response on DB write
    import("../db").then(async (db) => {
      try {
        await db.recordTokenUsage(
          userId,
          model,
          prompt_tokens,
          completion_tokens,
          0, // MiniMax doesn't expose thinking tokens separately
          costUSD
        );
      } catch (err) {
        console.warn("[LLM] Failed to record token usage:", err);
      }
    });
  }

  return result;
}

