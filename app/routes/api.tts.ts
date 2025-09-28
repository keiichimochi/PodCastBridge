import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";

import { findEpisodeById } from "../services/trends.server";
import { synthesizeEpisodeToJapaneseAudio } from "../services/tts.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ message: "Method not allowed" }, { status: 405 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let episodeId: string | null = null;

  if (contentType.includes("application/json")) {
    try {
      const payload = (await request.json()) as { episodeId?: string };
      episodeId = payload.episodeId ?? null;
    } catch (_error) {
      return json({ message: "Invalid JSON body" }, { status: 400 });
    }
  } else {
    const formData = await request.formData();
    const raw = formData.get("episodeId");
    if (typeof raw === "string") {
      episodeId = raw;
    }
  }

  if (!episodeId) {
    return json({ message: "episodeId is required" }, { status: 400 });
  }

  const match = await findEpisodeById(episodeId);
  if (!match) {
    return json({ message: "Episode not found" }, { status: 404 });
  }

  try {
    const tts = await synthesizeEpisodeToJapaneseAudio(match.episode);

    return json({
      success: true,
      audioUrl: tts.publicUrl,
      script: tts.script,
      estimatedDurationSeconds: tts.estimatedDurationSeconds,
      categoryId: match.category.id,
      episodeId: match.episode.id
    });
  } catch (error) {
    console.error("TTS generation failed", error);
    return json({ message: "TTS generation failed" }, { status: 500 });
  }
}
