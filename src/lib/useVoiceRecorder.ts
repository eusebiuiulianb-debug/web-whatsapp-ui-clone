import { useCallback, useRef, useState } from "react";
import { getPreferredAudioStream } from "./getPreferredAudioStream";

const DEFAULT_MIME_PREFERENCES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
];

type VoiceRecordResult = {
  blob: Blob;
  base64: string;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
};

function resolveMimeType(preferences: string[]) {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return "";
  for (const candidate of preferences) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("base64_failed"));
    };
    reader.readAsDataURL(blob);
  });
}

export function useVoiceRecorder(options?: { mimePreferences?: string[] }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRef = useRef(false);
  const stopResolverRef = useRef<((value: VoiceRecordResult | null) => void) | null>(null);
  const stopRejectRef = useRef<((error: unknown) => void) | null>(null);
  const mimeRef = useRef<string>("");

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    stopStream();
    chunksRef.current = [];
    startRef.current = null;
    recorderRef.current = null;
    cancelRef.current = false;
    setRecordingMs(0);
    setIsRecording(false);
  }, [clearTimer, stopStream]);

  const start = useCallback(async () => {
    if (isRecording) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("No se detecta micro en este navegador.");
    }
    const { stream, label, deviceId, isMonitor } = await getPreferredAudioStream();
    console.info("voice capture device:", label, deviceId ?? "");
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("No se detectó audio.");
    }
    if (isMonitor || audioTracks.some((track) => track.label.toLowerCase().includes("monitor"))) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Entrada de micro incorrecta (Monitor). Cambia a MicrophoneFX en ajustes.");
    }
    audioTracks.forEach((track) => {
      if (!track.enabled) track.enabled = true;
    });
    if (!audioTracks.some((track) => track.enabled)) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("No se detectó audio.");
    }
    streamRef.current = stream;
    const mimeType = resolveMimeType(options?.mimePreferences ?? DEFAULT_MIME_PREFERENCES);
    mimeRef.current = mimeType;
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];
    cancelRef.current = false;
    startRef.current = Date.now();
    setRecordingMs(0);
    setIsRecording(true);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onerror = () => {
      reset();
    };
    recorder.onstop = async () => {
      const startedAt = startRef.current ?? Date.now();
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      const chunks = chunksRef.current;
      clearTimer();
      stopStream();
      recorderRef.current = null;
      startRef.current = null;
      setIsRecording(false);
      setRecordingMs(0);
      if (cancelRef.current) {
        cancelRef.current = false;
        chunksRef.current = [];
        stopResolverRef.current?.(null);
        stopResolverRef.current = null;
        stopRejectRef.current = null;
        return;
      }
      const blob = new Blob(chunks, { type: mimeRef.current || "audio/webm" });
      chunksRef.current = [];
      try {
        const base64 = await blobToBase64(blob);
        const result: VoiceRecordResult = {
          blob,
          base64,
          durationMs: elapsedMs,
          mimeType: blob.type || mimeRef.current || "audio/webm",
          sizeBytes: blob.size,
        };
        stopResolverRef.current?.(result);
      } catch (err) {
        stopRejectRef.current?.(err);
      } finally {
        stopResolverRef.current = null;
        stopRejectRef.current = null;
      }
    };
    recorder.start();
    timerRef.current = setInterval(() => {
      if (!startRef.current) return;
      setRecordingMs(Date.now() - startRef.current);
    }, 250);
  }, [isRecording, options?.mimePreferences, reset, clearTimer, stopStream]);

  const stop = useCallback(() => {
    if (!isRecording) return Promise.resolve(null);
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      reset();
      return Promise.resolve(null);
    }
    return new Promise<VoiceRecordResult | null>((resolve, reject) => {
      stopResolverRef.current = resolve;
      stopRejectRef.current = reject;
      recorder.stop();
    });
  }, [isRecording, reset]);

  const cancel = useCallback(() => {
    if (!isRecording) {
      reset();
      return;
    }
    cancelRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      reset();
    }
  }, [isRecording, reset]);

  return {
    isRecording,
    recordingMs,
    start,
    stop,
    cancel,
    reset,
  };
}
