import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";

import { findEpisodeById } from "../services/trends.server";
import { synthesizeEpisodeToJapaneseAudio } from "../services/tts.server";
import {
  maxDurationOptionToSeconds,
  normalizeMaxDuration
} from "../utils/maxDuration";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ message: "Method not allowed" }, { status: 405 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let episodeId: string | null = null;
  let maxDurationSelection = normalizeMaxDuration(null);

  if (contentType.includes("application/json")) {
    try {
      const payload = (await request.json()) as { episodeId?: string; maxDuration?: string };
      episodeId = payload.episodeId ?? null;
      maxDurationSelection = normalizeMaxDuration(payload.maxDuration ?? null);
    } catch (_error) {
      return json({ message: "Invalid JSON body" }, { status: 400 });
    }
  } else {
    const formData = await request.formData();
    const raw = formData.get("episodeId");
    if (typeof raw === "string") {
      episodeId = raw;
    }
    const rawDuration = formData.get("maxDuration");
    if (typeof rawDuration === "string") {
      maxDurationSelection = normalizeMaxDuration(rawDuration);
    }
  }

  if (!episodeId) {
    return json({ message: "episodeId is required" }, { status: 400 });
  }

  const maxDurationSeconds = maxDurationOptionToSeconds(maxDurationSelection);
  const match = await findEpisodeById(episodeId, { maxDurationSeconds });
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
