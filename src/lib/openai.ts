import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }
  openaiClient ??= new OpenAI({ apiKey });
  return openaiClient;
}

function normalizeFactText(input: string): string {
  return (
    input
      .replace(/\s+/g, " ")
      .replace(/^["']+|["']+$/g, "")
      .trim()
  );
}

export async function generateFunFact(movieTitle: string): Promise<string> {
  const normalizedTitle = movieTitle.trim();

  const completion = await getOpenAI().chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You write a single fun fact about the movie provided by the user. Keep it short and friendly. Output only the fact text (no JSON).",
      },
      {
        role: "user",
        content: `Movie: ${normalizedTitle}\n\nWrite one fun fact about this movie. Keep it under 300 characters.`,
      },
    ],
    temperature: 0.7,
  });

  const raw = completion.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw : "";
  return normalizeFactText(text);
}
