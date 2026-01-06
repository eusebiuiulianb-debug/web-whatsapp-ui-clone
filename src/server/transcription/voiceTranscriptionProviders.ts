import fs from "fs/promises";
import path from "path";

export type VoiceTranscriptionInput = {
  messageId: string;
  audioUrl: string;
  audioMime?: string | null;
  audioSizeBytes?: number | null;
};

export type VoiceTranscriptionResult =
  | { status: "DONE"; transcriptText: string; transcriptLang?: string | null }
  | { status: "FAILED"; error: string };

export interface VoiceTranscriptionProvider {
  name: "openai_whisper" | "mock";
  transcribeVoiceNote(input: VoiceTranscriptionInput): Promise<VoiceTranscriptionResult>;
}

const MAX_FETCH_BYTES = 25 * 1024 * 1024;
const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";

function normalizeMimeType(mime?: string | null) {
  if (!mime) return "";
  return mime.split(";")[0].trim().toLowerCase();
}

function resolveExtension(mime: string, fallback: string) {
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("mp4")) return ".mp4";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("webm")) return ".webm";
  return fallback || ".webm";
}

function isSafeSegment(value: string) {
  if (!value) return false;
  if (value.includes("/") || value.includes("\\")) return false;
  return value.trim().length > 0;
}

function isSafeFilename(value: string) {
  if (!isSafeSegment(value)) return false;
  return /^[a-zA-Z0-9._-]+$/.test(value);
}

function resolveLocalAudioPath(audioUrl: string): string | null {
  const clean = audioUrl.split("?")[0];
  const apiPrefix = "/api/voice-notes/";
  const publicPrefix = "/uploads/voice-notes/";
  if (clean.startsWith(apiPrefix)) {
    const relative = clean.slice(apiPrefix.length);
    const [chatId, filename] = relative.split("/");
    if (!isSafeSegment(chatId) || !isSafeFilename(filename)) return null;
    return path.join(process.cwd(), "public", "uploads", "voice-notes", chatId, filename);
  }
  if (clean.startsWith(publicPrefix)) {
    const relative = clean.slice(publicPrefix.length);
    const [chatId, filename] = relative.split("/");
    if (!isSafeSegment(chatId) || !isSafeFilename(filename)) return null;
    return path.join(process.cwd(), "public", "uploads", "voice-notes", chatId, filename);
  }
  return null;
}

async function loadAudioBuffer(input: VoiceTranscriptionInput) {
  const localPath = resolveLocalAudioPath(input.audioUrl);
  const normalizedMime = normalizeMimeType(input.audioMime);
  if (localPath) {
    const buffer = await fs.readFile(localPath);
    const filename = path.basename(localPath);
    const ext = path.extname(filename).toLowerCase();
    const inferredMime =
      ext === ".ogg"
        ? "audio/ogg"
        : ext === ".mp4"
        ? "audio/mp4"
        : ext === ".mp3" || ext === ".mpeg"
        ? "audio/mpeg"
        : ext === ".wav"
        ? "audio/wav"
        : ext === ".webm"
        ? "audio/webm"
        : "";
    const mimeType = normalizedMime || inferredMime || "audio/webm";
    return { buffer, mimeType, filename };
  }

  if (!/^https?:\/\//i.test(input.audioUrl)) {
    throw new Error("audio_unavailable");
  }

  const response = await fetch(input.audioUrl);
  if (!response.ok) {
    throw new Error(`fetch_failed_${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_FETCH_BYTES) {
    throw new Error("audio_too_large");
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_FETCH_BYTES) {
    throw new Error("audio_too_large");
  }
  const headerMime = normalizeMimeType(response.headers.get("content-type"));
  const mimeType = normalizedMime || headerMime || "audio/webm";
  const extension = resolveExtension(mimeType, ".webm");
  const filename = `voice-${input.messageId}${extension}`;
  return { buffer, mimeType, filename };
}

class OpenAiWhisperProvider implements VoiceTranscriptionProvider {
  name: "openai_whisper" = "openai_whisper";

  async transcribeVoiceNote(input: VoiceTranscriptionInput): Promise<VoiceTranscriptionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { status: "FAILED", error: "missing_api_key" };
    }

    let audio;
    try {
      audio = await loadAudioBuffer(input);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "audio_unavailable";
      return { status: "FAILED", error: message };
    }

    const form = new FormData();
    form.append("model", OPENAI_TRANSCRIPTION_MODEL);
    form.append("file", new Blob([audio.buffer], { type: audio.mimeType }), audio.filename);

    try {
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      });

      if (!response.ok) {
        const rawError = await response.text();
        console.warn("openai_whisper_error", {
          status: response.status,
          message: rawError.slice(0, 200),
        });
        return { status: "FAILED", error: `openai_error_${response.status}` };
      }

      const data = (await response.json()) as { text?: string; language?: string } | null;
      const transcriptText = typeof data?.text === "string" ? data.text.trim() : "";
      if (!transcriptText) {
        return { status: "FAILED", error: "empty_transcript" };
      }
      const transcriptLang = typeof data?.language === "string" ? data.language : null;
      return { status: "DONE", transcriptText, transcriptLang };
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "openai_error";
      return { status: "FAILED", error: message };
    }
  }
}

class MockTranscriptionProvider implements VoiceTranscriptionProvider {
  name: "mock" = "mock";

  async transcribeVoiceNote(): Promise<VoiceTranscriptionResult> {
    return { status: "FAILED", error: "No provider configured" };
  }
}

export function getVoiceTranscriptionProvider(): VoiceTranscriptionProvider {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAiWhisperProvider();
  }
  return new MockTranscriptionProvider();
}
