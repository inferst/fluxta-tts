import { presetProblem, type Preset } from "tts-protocol";
import { describe, expect, it } from "vitest";

import { readPresetDraft, readPresets, readPresetSpeech } from "./presets";

const milena = {
  provider: "system",
  id: "com.apple.voice.compact.ru-RU.Milena",
  name: "Milena",
} as const;

const chat: Preset = {
  id: "preset-chat",
  name: "Chat",
  voice: milena,
  settings: { rate: 1.2 },
};

describe("readPresets", () => {
  it("reads what was saved, in its order", () => {
    const announcer: Preset = {
      id: "preset-announcer",
      name: "Announcer",
      voice: { provider: "system", id: "ava", name: "Ava (Premium)" },
      settings: { rate: 0.9 },
    };

    expect(readPresets([chat, announcer])).toEqual([chat, announcer]);
  });

  it("has none on a fresh install", () => {
    expect(readPresets(undefined)).toEqual([]);
    expect(readPresets({ presets: [chat] })).toEqual([]);
  });

  it("leaves out a Preset without an id, a name or a Voice it can read", () => {
    expect(
      readPresets([
        { ...chat, id: "" },
        { ...chat, id: "no-name", name: "  " },
        { ...chat, id: "no-voice", voice: undefined },
        { ...chat, id: "other-provider", voice: { ...milena, provider: "x" } },
        { ...chat, id: "no-voice-id", voice: { ...milena, id: "" } },
        "Chat",
        chat,
      ]),
    ).toEqual([chat]);
  });

  it("keeps the first of two Presets with one id", () => {
    expect(readPresets([chat, { ...chat, name: "Other" }])).toEqual([chat]);
  });

  it("clamps the rate to 0.5×–2×, and starts one it cannot read at 1.0×", () => {
    const rates = readPresets([
      { ...chat, id: "slow", settings: { rate: 0.1 } },
      { ...chat, id: "fast", settings: { rate: 9 } },
      { ...chat, id: "odd", settings: { rate: "fast" } },
      { ...chat, id: "none", settings: undefined },
    ]).map(({ settings }) => settings.rate);

    expect(rates).toEqual([0.5, 2, 1, 1]);
  });

  it("names a Voice by its id when its name is lost", () => {
    expect(
      readPresets([{ ...chat, voice: { ...milena, name: undefined } }])[0]
        .voice,
    ).toEqual({ ...milena, name: milena.id });
  });
});

describe("readPresetDraft", () => {
  it("reads a new Preset without an id, and an edited one with it", () => {
    const fresh = {
      name: chat.name,
      voice: chat.voice,
      settings: chat.settings,
    };

    expect(readPresetDraft(fresh)).toEqual(fresh);
    expect(readPresetDraft(chat)).toEqual(chat);
  });

  it("trims the name and keeps at most 60 characters of it", () => {
    expect(readPresetDraft({ ...chat, name: "  Chat  " })?.name).toBe("Chat");
    expect(readPresetDraft({ ...chat, name: "x".repeat(80) })?.name).toBe(
      "x".repeat(60),
    );
  });

  it("is nothing without a name or a Voice", () => {
    expect(readPresetDraft({ ...chat, name: "" })).toBeUndefined();
    expect(readPresetDraft({ ...chat, voice: null })).toBeUndefined();
    expect(readPresetDraft(null)).toBeUndefined();
  });
});

describe("readPresetSpeech", () => {
  it("reads a Preset dialog's form: a Voice and its Provider's settings", () => {
    expect(
      readPresetSpeech({ voice: milena, settings: { rate: 1.5 } }),
    ).toEqual({ voice: milena, settings: { rate: 1.5 } });
    expect(readPresetSpeech({ settings: { rate: 1.5 } })).toBeUndefined();
  });
});

describe("presetProblem", () => {
  const others = [chat];

  it("asks for a name, a free one, and a Voice", () => {
    expect(presetProblem({ name: " " }, others)).toBe(
      "Give this Preset a name.",
    );
    expect(presetProblem({ name: "Chat", voice: milena }, others)).toBe(
      'Another Preset is already named "Chat".',
    );
    expect(presetProblem({ name: "Announcer" }, others)).toBe(
      "Choose the voice this Preset speaks with.",
    );
    expect(presetProblem({ name: "x".repeat(61), voice: milena }, [])).toBe(
      "A Preset's name is at most 60 characters.",
    );
  });

  it("lets a Preset keep its own name", () => {
    expect(
      presetProblem({ id: chat.id, name: "Chat", voice: milena }, others),
    ).toBeUndefined();
  });
});
