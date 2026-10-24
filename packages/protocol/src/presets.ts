/**
 * A Provider by the name the plugin knows it under: `system` is this
 * computer's voices.
 */
export type ProviderName = "system";

/** The Provider of this computer's voices. */
export const SYSTEM_PROVIDER = "system" satisfies ProviderName;

/**
 * A Preset's Voice: its Provider, the Provider's own id for it — meaningless
 * to any other Provider — and its name, to show while it is not here.
 */
export type PresetVoice = { provider: ProviderName; id: string; name: string };

/** How this computer's voices speak: Rate is all they share. */
export type SystemSettings = {
  /** A multiplier, 1 being the voice's normal pace. */
  rate: number;
};

/**
 * A Preset: a name, a Voice of one Provider and that Provider's own
 * settings. Made in the Plugin Editor; Speak picks one, or the Default
 * Preset.
 */
export type Preset = {
  /** Chosen by the sidecar; kept through a rename. */
  id: string;
  name: string;
  voice: PresetVoice;
  settings: SystemSettings;
};

/** What a Preset speaks with, without its name: a Preset dialog's form. */
export type PresetSpeech = Pick<Preset, "voice" | "settings">;

/** A Preset as the Plugin Editor saves it: a new one has no id yet. */
export type PresetDraft = Omit<Preset, "id"> & { id?: string };

export const RATE_MIN = 0.5;
export const RATE_MAX = 2;

/** Every rate the editors offer: 0.5× to 2.0× in steps of 0.1. */
export const RATES: readonly number[] = Array.from(
  { length: Math.round((RATE_MAX - RATE_MIN) * 10) + 1 },
  (_, step) => (RATE_MIN * 10 + step) / 10,
);

/** A rate as the editors show it: `1.0×`. */
export function formatRate(rate: number): string {
  return `${rate.toFixed(1)}×`;
}

/** The settings a new Preset of this computer's voices starts with. */
export const INITIAL_SYSTEM_SETTINGS: SystemSettings = { rate: 1 };

/** How long a Preset's name may be. */
export const PRESET_NAME_MAX = 60;

/**
 * Why a Preset cannot be saved as it is — a person reads it in the Preset
 * dialog — or nothing. `others` are every other Preset: two of one name
 * could not be told apart where Speak picks one.
 */
export function presetProblem(
  draft: Pick<PresetDraft, "id" | "name"> & { voice?: PresetVoice },
  others: readonly Pick<Preset, "id" | "name">[],
): string | undefined {
  const name = draft.name.trim();
  if (!name) {
    return "Give this Preset a name.";
  }
  if (name.length > PRESET_NAME_MAX) {
    return `A Preset's name is at most ${PRESET_NAME_MAX} characters.`;
  }
  if (others.some((other) => other.id !== draft.id && other.name === name)) {
    return `Another Preset is already named "${name}".`;
  }
  if (!draft.voice) {
    return "Choose the voice this Preset speaks with.";
  }
  return undefined;
}
