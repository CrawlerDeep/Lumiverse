import type { TtsProvider } from "../provider";
import type { TtsProviderCapabilities } from "../param-schema";
import type { TtsRequest, TtsResponse, TtsStreamChunk, TtsVoice } from "../types";
import { ProviderRequestError, throwProviderResponseError } from "../../utils/provider-errors";
import {
  GOOGLE_TTS_MODELS,
  GOOGLE_TTS_PARAMETERS,
  GOOGLE_TTS_VOICES,
  buildGeminiTtsBody,
  extractGeminiTtsAudio,
} from "./google-tts-shared";

/**
 * Google AI Studio text-to-speech. Auth mirrors the Gemini text connection:
 * a plain API key. TTS-only model list with mapped prebuilt voices.
 */
export class GoogleTtsProvider implements TtsProvider {
  readonly name = "google_tts";
  readonly displayName = "Google AI Studio TTS";

  readonly capabilities: TtsProviderCapabilities = {
    parameters: { ...GOOGLE_TTS_PARAMETERS },
    apiKeyRequired: true,
    voiceListStyle: "static",
    staticVoices: GOOGLE_TTS_VOICES,
    modelListStyle: "static",
    staticModels: GOOGLE_TTS_MODELS,
    supportsStreaming: false,
    supportedFormats: ["wav"],
    defaultUrl: "https://generativelanguage.googleapis.com",
    defaultFormat: "wav",
  };

  private baseUrl(apiUrl: string): string {
    let url = (apiUrl || this.capabilities.defaultUrl).replace(/\/+$/, "");
    url = url.replace(/\/v1beta\/models(\/.*)?$/, "");
    url = url.replace(/\/v1beta$/, "");
    return url;
  }

  async synthesize(apiKey: string, apiUrl: string, request: TtsRequest): Promise<TtsResponse> {
    if (!apiKey) {
      throw new ProviderRequestError({
        provider: this.displayName,
        operation: "tts synthesize",
        detail: "Missing Google AI Studio API key",
        retryable: false,
      });
    }
    if (!request.voice) {
      throw new ProviderRequestError({
        provider: this.displayName,
        operation: "tts synthesize",
        detail: "No voice selected",
        retryable: false,
      });
    }
    const url = `${this.baseUrl(apiUrl)}/v1beta/models/${request.model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGeminiTtsBody(request)),
      signal: request.signal,
    });
    if (!res.ok) await throwProviderResponseError(this.displayName, "tts synthesize", res);
    const data = await res.json();
    const { audioData, contentType } = extractGeminiTtsAudio(data);
    return { audioData, contentType, model: request.model, provider: this.name };
  }

  async *synthesizeStream(): AsyncGenerator<TtsStreamChunk, void, unknown> {
    throw new Error(`${this.displayName} does not support streaming`);
  }

  async validateKey(apiKey: string, apiUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl(apiUrl)}/v1beta/models?pageSize=1&key=${encodeURIComponent(apiKey)}`);
      if (!res.ok) await throwProviderResponseError(this.displayName, "authentication", res);
      return res.ok;
    } catch (err) {
      if (err instanceof ProviderRequestError) throw err;
      throw new ProviderRequestError({ provider: this.displayName, operation: "authentication", detail: err instanceof Error ? err.message : "network request failed", retryable: true });
    }
  }

  async listModels(_apiKey: string, _apiUrl: string): Promise<Array<{ id: string; label: string }>> {
    return this.capabilities.staticModels || [];
  }

  async listVoices(_apiKey: string, _apiUrl: string): Promise<TtsVoice[]> {
    return this.capabilities.staticVoices || [];
  }
}
