import {
  INITIAL_SYSTEM_SETTINGS,
  SYSTEM_PROVIDER,
  type Preset,
  type PresetSpeech,
  type SystemSettings,
} from "tts-protocol";

import { ProviderError, type Provider } from "../speech/provider";
import type { Phrase, Synthesis } from "../speech/speech-queue";
import type { Voices } from "../speech/voices";

/** Every Provider a Preset can speak with, by the name a Voice gives. */
export type Providers = { system: Provider<SystemSettings> };

/** What turns a Phrase's Preset into its synthesis. */
export type SynthesisSources = {
  /** The Presets as they stand. */
  presets: () => readonly Preset[];
  providers: Providers;
  /** The `system` Provider's: the OS's voice, while there is no Default Preset. */
  voices: Voices;
};

/** What synthesizes `phrase`: its Voice and settings, bound to its Provider. */
export async function synthesisOf(
  phrase: Pick<Phrase, "preset" | "speech">,
  sources: SynthesisSources,
): Promise<Synthesis> {
  const { voice, settings } = await speechOf(phrase, sources);
  switch (voice.provider) {
    case SYSTEM_PROVIDER:
      return (text, signal) =>
        sources.providers.system.synthesize(text, voice.id, settings, signal);
  }
}

/**
 * What a Phrase speaks with: a Listen's unsaved form, else its Preset as it
 * stands now — an edit reaches the Phrases already waiting — else, while
 * there is no Default Preset, the OS's voice at 1.0×. A Preset that is not
 * here drops the Phrase, as a Voice that is not here does: nothing is
 * substituted for it.
 */
export async function speechOf(
  { preset, speech }: Pick<Phrase, "preset" | "speech">,
  { presets, voices }: Pick<SynthesisSources, "presets" | "voices">,
): Promise<PresetSpeech> {
  if (speech) {
    return speech;
  }
  if (preset) {
    const found = presets().find(({ id }) => id === preset.id);
    if (!found) {
      throw new ProviderError(
        "voice-missing",
        `No Preset ${preset.name} on this computer`,
      );
    }
    return found;
  }
  const id = await voices.osDefault();
  return {
    voice: { provider: SYSTEM_PROVIDER, id, name: id },
    settings: INITIAL_SYSTEM_SETTINGS,
  };
}
