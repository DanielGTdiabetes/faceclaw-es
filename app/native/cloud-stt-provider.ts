import type { CloudSttClient, CloudSttOptions } from "./cloud-stt";
import { ElevenLabsSttClient } from "./elevenlabs-stt";
import { EvenSttClient, evenSttUrl } from "./even-stt";
import { FallbackSttClient, type LocalTranscribe } from "./fallback-stt";
import { OpenAiRealtimeSttClient } from "./openai-stt";
import { ReconnectingSttClient } from "./reconnecting-stt";
import { SonioxSttClient } from "./soniox-stt";
import type { VoiceProviderKind } from "./voice-control";

/**
 * The transcription-provider setting plus the keys the cloud providers need.
 * Shared by the Android and iOS voice bridges.
 */
export type VoiceProviderSelection = {
  provider: VoiceProviderKind;
  elevenLabsApiKey: string;
  openAiApiKey: string;
  sonioxApiKey: string;
  /** Self-hosted EVO-X2 endpoint and its Bearer key (Android only). */
  evenAsrUrl?: string;
  evenAsrKey?: string;
};

type CloudProvider = {
  name: string;
  apiKey: (selection: VoiceProviderSelection) => string;
  /** Why the selection cannot be used even with a key, e.g. a malformed URL. */
  unusable?: (selection: VoiceProviderSelection) => string | null;
  create: (options: CloudSttOptions, selection: VoiceProviderSelection) => CloudSttClient;
  /** Self-hosted: a failed push-to-talk utterance is re-transcribed on the phone instead of retried. */
  localFallback?: boolean;
};

// Providers absent here ("onboard" and the "onboard-whisper*" models) transcribe on-device.
const CLOUD_PROVIDERS: Partial<Record<VoiceProviderKind, CloudProvider>> = {
  elevenlabs: {
    name: "ElevenLabs",
    apiKey: (selection) => selection.elevenLabsApiKey,
    create: (options) => new ElevenLabsSttClient(options),
  },
  soniox: {
    name: "Soniox",
    apiKey: (selection) => selection.sonioxApiKey,
    create: (options) => new SonioxSttClient(options),
  },
  whisper: {
    name: "OpenAI",
    apiKey: (selection) => selection.openAiApiKey,
    create: (options) => new OpenAiRealtimeSttClient(options),
  },
  even: {
    name: "EVO-X2",
    apiKey: (selection) => selection.evenAsrKey ?? "",
    unusable: (selection) => evenSttUrl(selection.evenAsrUrl ?? "") ? null : "EVO-X2 address is not a ws:// URL",
    create: (options, selection) => new EvenSttClient({ ...options, url: evenSttUrl(selection.evenAsrUrl ?? "")! }),
    localFallback: true,
  },
};

/** Whether createCloudSttClient would return a cloud client for this selection. */
export function usesCloudStt(selection: VoiceProviderSelection): boolean {
  const provider = CLOUD_PROVIDERS[selection.provider];
  return Boolean(provider?.apiKey(selection).trim() && !provider.unusable?.(selection));
}

/**
 * The cloud provider for a capture, or null to transcribe on-device. A cloud
 * provider whose API key is missing falls back to on-device (reported via
 * onStatus) rather than failing the capture outright. `continuous` says
 * whether the capture is open-ended (Transcribe), where pauses commit segments.
 * With `local`, a self-hosted provider's push-to-talk capture falls back to
 * on-device transcription of the captured audio when the server fails.
 */
export function createCloudSttClient(
  selection: VoiceProviderSelection,
  options: Omit<CloudSttOptions, "apiKey">,
  continuous: () => boolean,
  local?: LocalTranscribe,
): CloudSttClient | null {
  const provider = CLOUD_PROVIDERS[selection.provider];
  if (!provider) return null;
  const apiKey = provider.apiKey(selection).trim();
  const unusable = provider.unusable?.(selection);
  // An incomplete persisted EVO-X2 setting still needs the downloaded Whisper
  // selection used by normal remote failures; never silently switch to Moonshine.
  if (provider.localFallback && local && !continuous() && (!apiKey || unusable)) {
    const reason = !apiKey ? "No EVO-X2 key set" : unusable!;
    return new FallbackSttClient((clientOptions) => ({
      start: () => clientOptions.onDisconnected?.(reason),
      acceptPcm() {}, finish() {}, stop() {},
    }), { ...options, apiKey }, local);
  }
  if (!apiKey) {
    options.onStatus(`No ${provider.name} key set; using on-device voice.`);
    return null;
  }
  if (unusable) {
    options.onStatus(`${unusable}; using on-device voice.`);
    return null;
  }
  const create = (clientOptions: CloudSttOptions) => provider.create(clientOptions, selection);
  if (provider.localFallback && local && !continuous()) {
    return new FallbackSttClient(create, { ...options, apiKey }, local);
  }
  return new ReconnectingSttClient(create, { ...options, apiKey }, continuous);
}
