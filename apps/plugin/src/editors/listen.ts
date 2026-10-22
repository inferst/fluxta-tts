import type { Defaults, ListenSettings } from "tts-protocol";

import { effectiveSettings } from "../settings/defaults";
import { ProviderError } from "../speech/provider";
import type { Phrase } from "../speech/speech-queue";
import type { Voices } from "../speech/voices";

/**
 * A Listen's Phrase: the Voice's name — every voice can say it, and no text
 * needs translating — spoken as the editor's form stands, unsaved. What the
 * form leaves out follows the Defaults, as on Speak; the Length Limit plays
 * no part.
 */
export async function listenPhrase(
  id: string,
  settings: ListenSettings,
  defaults: Defaults,
  voices: Voices,
): Promise<Phrase> {
  const { voice, rate, volume, device } = effectiveSettings(defaults, settings);
  const voiceId = voice ?? (await voices.osDefault());
  const found = (await voices.list()).find(
    (candidate) => candidate.id === voiceId,
  );
  if (!found) {
    throw new ProviderError(
      "voice-missing",
      "This voice is not on this computer",
    );
  }
  return {
    text: spokenName(found.name),
    tags: [],
    voice: found.id,
    rate,
    volume: volume / 100,
    device,
    listen: id,
  };
}

/**
 * A Voice's name as it is said: macOS writes the quality into some names —
 * "Katya (Enhanced)" — and the voice would read it out.
 */
export function spokenName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "") || name;
}
