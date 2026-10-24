import type { Preset, SystemSettings } from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import type { Provider, Voice } from "../speech/provider";
import { Voices } from "../speech/voices";
import { synthesisOf } from "./synthesis";

const milena: Voice = {
  id: "milena",
  name: "Milena",
  language: "ru-RU",
  isDefault: true,
};

const announcer: Preset = {
  id: "preset-announcer",
  name: "Announcer",
  voice: { provider: "system", id: "ava", name: "Ava (Premium)" },
  settings: { rate: 1.4 },
};

function setup(presets: Preset[] = [announcer]) {
  const synthesize = vi.fn<Provider<SystemSettings>["synthesize"]>(
    async () => new Uint8Array([1]),
  );
  const system: Provider<SystemSettings> = {
    voices: async () => [milena],
    synthesize,
  };
  const sources = {
    presets: () => presets,
    providers: { system },
    voices: new Voices(system),
  };
  const signal = new AbortController().signal;
  const speak = async (phrase: Parameters<typeof synthesisOf>[0]) =>
    (await synthesisOf(phrase, sources))("Привет", signal);
  return { speak, synthesize, signal };
}

describe("synthesisOf", () => {
  it("speaks with a Preset's Voice and settings, through its Provider", async () => {
    const { speak, synthesize, signal } = setup();

    expect(
      await speak({ preset: { id: announcer.id, name: "Announcer" } }),
    ).toEqual(new Uint8Array([1]));

    expect(synthesize).toHaveBeenCalledWith(
      "Привет",
      "ava",
      { rate: 1.4 },
      signal,
    );
  });

  it("reads the Preset as it stands when the Phrase's turn comes", async () => {
    const presets = [announcer];
    const { speak, synthesize } = setup(presets);

    presets[0] = { ...announcer, settings: { rate: 0.6 } };
    await speak({ preset: { id: announcer.id, name: "Announcer" } });

    expect(synthesize.mock.calls[0][2]).toEqual({ rate: 0.6 });
  });

  it("speaks with the OS's voice at 1.0× while there is no Default Preset", async () => {
    const { speak, synthesize } = setup();

    await speak({});

    expect(synthesize.mock.calls[0].slice(1, 3)).toEqual([
      "milena",
      { rate: 1 },
    ]);
  });

  it("speaks a Preset dialog's unsaved form over any Preset", async () => {
    const { speak, synthesize } = setup();

    await speak({
      preset: { id: announcer.id, name: "Announcer" },
      speech: {
        voice: { provider: "system", id: "milena", name: "Milena" },
        settings: { rate: 0.8 },
      },
    });

    expect(synthesize.mock.calls[0].slice(1, 3)).toEqual([
      "milena",
      { rate: 0.8 },
    ]);
  });

  it("drops a Phrase whose Preset is not here as voice-missing, speaking nothing else", async () => {
    const { speak, synthesize } = setup([]);

    await expect(
      speak({ preset: { id: "gone", name: "Announcer" } }),
    ).rejects.toMatchObject({
      kind: "voice-missing",
      message: "No Preset Announcer on this computer",
    });
    expect(synthesize).not.toHaveBeenCalled();
  });
});
