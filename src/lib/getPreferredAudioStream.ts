type PreferredAudioStreamResult = {
  stream: MediaStream;
  label: string;
  deviceId: string | null;
  isMonitor: boolean;
};

function normalizeLabel(label: string) {
  return label.toLowerCase();
}

function matches(label: string, needle: string) {
  return normalizeLabel(label).includes(needle);
}

function isBadLoopback(label: string) {
  const lowered = normalizeLabel(label);
  return lowered.includes("monitor") || lowered.includes("stereo mix") || lowered.includes("loopback");
}

export async function getPreferredAudioStream(): Promise<PreferredAudioStreamResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("media_devices_unavailable");
  }

  const unlockStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  unlockStream.getTracks().forEach((track) => track.stop());

  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter((device) => device.kind === "audioinput");

  const pickBy = (predicate: (label: string) => boolean) =>
    audioInputs.find((device) => predicate(device.label || ""));

  const preferred =
    pickBy((label) => matches(label, "microphonefx")) ||
    pickBy((label) => matches(label, "wave xlr") || matches(label, "microphone")) ||
    audioInputs.find((device) => !isBadLoopback(device.label || "")) ||
    audioInputs[0];

  const constraints =
    preferred?.deviceId
      ? {
          audio: {
            deviceId: { exact: preferred.deviceId },
          },
        }
      : { audio: true };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = stream.getAudioTracks()[0];
  const label = track?.label || preferred?.label || "";
  const settings = track?.getSettings ? track.getSettings() : {};
  const deviceId = typeof settings.deviceId === "string" ? settings.deviceId : preferred?.deviceId ?? null;
  const isMonitor = isBadLoopback(label);

  return { stream, label, deviceId, isMonitor };
}
