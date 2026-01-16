import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

const BodySchema = z.object({
  text: z.string().min(1),
  context: z
    .object({
      stage: z.string().optional(),
      path: z.number().int().min(1).max(4).nullable().optional(),
    })
    .optional(),
});

const ResultSchema = z.object({
  kind: z.enum(["choice", "yes", "no", "other"]),
  choice: z.number().int().min(1).max(4).optional(),
  confidence: z.number().min(0).max(1),
});

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY." }, { status: 500 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const { text, context } = parsed.data;

  try {
    // The OpenAI provider reads OPENAI_API_KEY from env internally.
    // Keep the explicit env check above for clearer errors.
    void apiKey;
    const model = openai("gpt-4o-mini");
    const { object } = await generateObject({
      model,
      schema: ResultSchema,
      system:
        "You are a strict classifier for a chat automation. " +
        "Return ONLY the JSON object, following the schema. " +
        "Interpret the user's message intent. " +
        "If they clearly pick an option 1-4 (even without writing the number), return kind=choice and choice=1..4. " +
        "If they confirm (yes/ok/send it), return kind=yes. If they decline (no/not now), return kind=no. " +
        "Otherwise return kind=other. Confidence is 0..1.",
      prompt: `Message: ${JSON.stringify(text)}\nContext: ${JSON.stringify(context ?? {})}`,
    });

    return NextResponse.json({ ok: true, result: object });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI error." }, { status: 502 });
  }
}

