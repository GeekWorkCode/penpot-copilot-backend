import OpenAI from "openai";

export function getModel(openai_key: string) {
  if (openai_key == "self") {
    return new OpenAI({
      apiKey: process.env.OPENAI_KEY,
    });
  } else {
    return new OpenAI({
      apiKey: openai_key,
    });
  }
}

export async function generatePromptResponse(
  openai: OpenAI,
  systemMessage: string,
  userMessages: string[],
  model: string = "gpt-4o-mini",
) {
  const userMessagesPresented = userMessages.map((userMessage) => {
    return {
      role: "user",
      content: userMessage,
    } as const;
  });

  const systemMessagePresented = {
    role: "system",
    content: systemMessage,
  } as const;

  const messages: { role: "system" | "user"; content: string }[] = [
    systemMessagePresented,
    ...userMessagesPresented,
  ];

  const completion = await openai.chat.completions.create({
    model,
    messages,
  });

  return completion.choices[0].message;
}
