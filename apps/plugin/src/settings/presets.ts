import {
  INITIAL_SYSTEM_SETTINGS,
  PRESET_NAME_MAX,
  RATE_MAX,
  RATE_MIN,
  SYSTEM_PROVIDER,
  type Preset,
  type PresetDraft,
  type PresetSpeech,
  type PresetVoice,
  type SystemSettings,
} from "tts-protocol";

import { isRecord, nameOf } from "./values";

/**
 * The Presets as saved, read warily: one this version cannot read is left
 * out — a Speak on it is then dropped as any Speak on a missing Preset —
 * rather than failing every Speak. Of two with one id, the first is kept.
 */
export function readPresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const presets: Preset[] = [];
  for (const value of raw) {
    const preset = readPreset(value);
    if (preset && !presets.some(({ id }) => id === preset.id)) {
      presets.push(preset);
    }
  }
  return presets;
}

function readPreset(raw: unknown): Preset | undefined {
  const draft = readPresetDraft(raw);
  return draft?.id === undefined ? undefined : { ...draft, id: draft.id };
}

/**
 * A Preset as its dialog sent it, read warily: without a name or a Voice it
 * is nothing to save. An id is kept only when it is text.
 */
export function readPresetDraft(raw: unknown): PresetDraft | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const name = nameOf(raw.name);
  const speech = readPresetSpeech(raw);
  if (name === undefined || speech === undefined) {
    return undefined;
  }
  return {
    ...(typeof raw.id === "string" && raw.id !== "" && { id: raw.id }),
    name: name.slice(0, PRESET_NAME_MAX),
    ...speech,
  };
}

/**
 * What a Preset speaks with — a Voice of a Provider this version knows, and
 * that Provider's settings, each read warily.
 */
export function readPresetSpeech(raw: unknown): PresetSpeech | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const voice = voiceOf(raw.voice);
  if (voice === undefined) {
    return undefined;
  }
  return { voice, settings: systemSettingsOf(raw.settings) };
}

function voiceOf(value: unknown): PresetVoice | undefined {
  if (
    !isRecord(value) ||
    value.provider !== SYSTEM_PROVIDER ||
    typeof value.id !== "string" ||
    value.id === ""
  ) {
    return undefined;
  }
  return {
    provider: value.provider,
    id: value.id,
    name: nameOf(value.name) ?? value.id,
  };
}

/** Each setting it cannot read starts as a new Preset's would. */
function systemSettingsOf(value: unknown): SystemSettings {
  const rate = isRecord(value) ? value.rate : undefined;
  return {
    rate:
      typeof rate === "number" && Number.isFinite(rate)
        ? Math.min(RATE_MAX, Math.max(RATE_MIN, rate))
        : INITIAL_SYSTEM_SETTINGS.rate,
  };
}
