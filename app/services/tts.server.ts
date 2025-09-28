import { GoogleGenAI, MediaResolution, Modality, type Session } from "@google/genai";
import { mkdir, writeFile } from "fs/promises";
import path from "node:path";

import { translateTextToJapanese } from "~/services/translation.server";
import type { PodcastEpisode } from "~/types/podcast";

export interface TtsGenerationResult {
  script: string;
  audioPath: string;
  publicUrl: string;
  audioFormat: string;
  estimatedDurationSeconds: number;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function buildNarrationScript(episode: PodcastEpisode): Promise<string> {
  const cleanDescription = stripHtml(episode.description).slice(0, 600);
  const releaseDateJp = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeZone: "America/Los_Angeles"
  }).format(new Date(episode.releaseDate));

  const [titleJp, descriptionJp] = await Promise.all([
    translateTextToJapanese(episode.title),
    translateTextToJapanese(cleanDescription)
  ]);

  return [
    `こんにちは。アメリカの人気ポッドキャスト「${episode.podcastTitle}」の注目エピソードをご紹介します。`,
    `エピソードタイトルは「${titleJp}」。公開日は${releaseDateJp}です。`,
    descriptionJp ? `内容のハイライト: ${descriptionJp}` : undefined,
    "より詳しい内容は本編でお楽しみください。"
  ]
    .filter(Boolean)
    .join("\n");
}

export async function synthesizeEpisodeToJapaneseAudio(
  episode: PodcastEpisode
): Promise<TtsGenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const script = await buildNarrationScript(episode);
  const { buffer: audioBuffer, mimeType } = await generateGeminiAudio({
    apiKey,
    script
  });
  const publicDir = path.resolve("public", "audio");
  await mkdir(publicDir, { recursive: true });

  const audioFormat = extractAudioExtension(mimeType);
  const filename = `${episode.id}.${audioFormat}`;
  const absoluteAudioPath = path.join(publicDir, filename);

  await writeFile(absoluteAudioPath, audioBuffer);

  const estimatedDurationSeconds = Math.round(script.length / 8);

  return {
    script,
    audioPath: absoluteAudioPath,
    publicUrl: `/audio/${filename}`,
    audioFormat,
    estimatedDurationSeconds
  };
}

interface GeminiAudioOptions {
  apiKey: string;
  script: string;
}

interface GeminiAudioResult {
  buffer: Buffer;
  mimeType: string;
}

async function generateGeminiAudio({ apiKey, script }: GeminiAudioOptions): Promise<GeminiAudioResult> {
  const ai = new GoogleGenAI({ apiKey });
  const audioParts: string[] = [];
  let inlineMimeType: string | undefined;
  let completed = false;
  let session: Session | undefined;

  try {
    const result = await new Promise<GeminiAudioResult>((resolve, reject) => {
      ai.live
        .connect({
          model: "models/gemini-2.5-flash-native-audio-preview-09-2025",
          config: {
            responseModalities: [Modality.AUDIO],
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Zephyr"
                }
              }
            },
            contextWindowCompression: {
              triggerTokens: "25600",
              slidingWindow: { targetTokens: "12800" }
            }
          },
          callbacks: {
            onmessage(message) {
              const parts = message.serverContent?.modelTurn?.parts ?? [];
              for (const part of parts) {
                const inline = part.inlineData;
                if (inline?.data) {
                  inlineMimeType = inline.mimeType ?? inlineMimeType;
                  audioParts.push(inline.data);
                }
              }

              if (message.serverContent?.turnComplete && !completed) {
                completed = true;
                if (!audioParts.length) {
                  reject(new Error("Gemini TTS response did not include inline audio data"));
                  return;
                }

                const buffer = convertToWav(audioParts, inlineMimeType ?? DEFAULT_AUDIO_MIME_TYPE);
                resolve({ buffer, mimeType: "audio/wav" });
              }
            },
            onerror(error) {
              if (!completed) {
                completed = true;
                reject(error instanceof Error ? error : new Error(String(error)));
              }
            },
            onclose() {
              if (!completed) {
                completed = true;
                reject(new Error("Gemini TTS session closed before completion"));
              }
            }
          }
        })
        .then((connectedSession) => {
          session = connectedSession;
          try {
            const result = connectedSession.sendClientContent({ turns: [script] });
            Promise.resolve(result).catch((error: unknown) => {
              if (!completed) {
                completed = true;
                reject(error instanceof Error ? error : new Error(String(error)));
              }
            });
          } catch (error) {
            if (!completed) {
              completed = true;
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          }
        })
        .catch((error: unknown) => {
          if (!completed) {
            completed = true;
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
    });

    return result;
  } finally {
    session?.close();
  }
}

const DEFAULT_AUDIO_MIME_TYPE = "audio/L16;rate=24000";

interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

function convertToWav(rawData: string[], mimeType: string): Buffer {
  if (!rawData.length) {
    throw new Error("No audio data to convert");
  }

  if (mimeType.startsWith("audio/wav")) {
    const buffers = rawData.map((data) => Buffer.from(data, "base64"));
    return Buffer.concat(buffers);
  }

  const options = parseMimeType(mimeType);
  const pcmBuffers = rawData.map((data) => Buffer.from(data, "base64"));
  const pcmBuffer = Buffer.concat(pcmBuffers);
  const header = createWavHeader(pcmBuffer.length, options);
  return Buffer.concat([header, pcmBuffer]);
}

function parseMimeType(mimeType: string): WavConversionOptions {
  const [fileType, ...params] = mimeType.split(";").map((s) => s.trim());
  const [, format] = fileType.split("/");

  const options: WavConversionOptions = {
    numChannels: 1,
    bitsPerSample: 16,
    sampleRate: 24000
  };

  if (format?.startsWith("L")) {
    const bits = Number.parseInt(format.slice(1), 10);
    if (!Number.isNaN(bits)) {
      options.bitsPerSample = bits;
    }
  }

  for (const param of params) {
    const [key, value] = param.split("=").map((s) => s.trim());
    if (key === "rate") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        options.sampleRate = parsed;
      }
    }
    if (key === "channels") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        options.numChannels = parsed;
      }
    }
  }

  return options;
}

function createWavHeader(dataLength: number, options: WavConversionOptions) {
  const { numChannels, sampleRate, bitsPerSample } = options;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

function extractAudioExtension(mimeType: string): string {
  const subtype = mimeType.split("/")[1] ?? "wav";
  return subtype.split(";")[0] || "wav";
}
