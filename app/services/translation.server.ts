const DEFAULT_TRANSLATE_ENDPOINT =
  process.env.LIBRE_TRANSLATE_API_URL ?? "https://libretranslate.com/translate";

export async function translateTextToJapanese(input: string): Promise<string> {
  const text = input.trim();
  if (!text) {
    return "";
  }

  try {
    const response = await fetch(DEFAULT_TRANSLATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: text,
        source: "en",
        target: "ja",
        format: "text",
        api_key: process.env.LIBRE_TRANSLATE_API_KEY ?? undefined
      })
    });

    if (!response.ok) {
      throw new Error(`Translation API responded with ${response.status}`);
    }

    const data = (await response.json()) as { translatedText?: string };
    if (data.translatedText) {
      return data.translatedText;
    }
  } catch (error) {
    console.warn("Translation failed, falling back to original text", error);
  }

  return `英語原文: ${text}`;
}
