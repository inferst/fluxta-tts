import type { ElevenLabsSettings } from "tts-protocol";

import {
  ProviderError,
  type Audio,
  type Provider,
  type Voice,
} from "../speech/provider";
import type { ElevenLabsClient } from "./client";

/**
 * The `elevenlabs` Provider: the voices of the account whose API key is
 * stored — its My Voices on the site, which is where the set is managed.
 */
export class ElevenLabsProvider implements Provider<ElevenLabsSettings> {
  readonly #client: Pick<ElevenLabsClient, "voices">;

  constructor(client: Pick<ElevenLabsClient, "voices">) {
    this.#client = client;
  }

  voices(): Promise<Voice[]> {
    return this.#client.voices();
  }

  synthesize(): Promise<Audio> {
    return Promise.reject(
      new ProviderError(
        "unavailable",
        "This version of Text to Speech cannot speak with ElevenLabs voices yet",
      ),
    );
  }
}
