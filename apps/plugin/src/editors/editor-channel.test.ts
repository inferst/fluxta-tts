import { INITIAL_DEFAULTS, type PluginMessage } from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import { DefaultsStore } from "../settings/defaults-store";
import { Listing } from "../speech/listing";
import { PlayerError, type Device, type Player } from "../speech/player";
import { ProviderError, type Provider, type Voice } from "../speech/provider";
import { Voices } from "../speech/voices";
import { EditorChannel } from "./editor-channel";

const milena: Voice = {
  id: "milena",
  name: "Milena",
  language: "ru-RU",
  isDefault: true,
};
const ava: Voice = {
  id: "ava",
  name: "Ava",
  language: "en-US",
  quality: "premium",
};

const blackHole: Device = { id: "BlackHole2ch_UID", name: "BlackHole 2ch" };
const speakers: Device = {
  id: "BuiltInSpeakerDevice",
  name: "Mac mini Speakers",
  isDefault: true,
};

function setup({
  lookUpVoices = async () => [milena, ava],
  lookUpDevices = async () => [blackHole, speakers],
}: {
  lookUpVoices?: Provider["voices"];
  lookUpDevices?: Player["devices"];
} = {}) {
  const sent: PluginMessage[] = [];
  const voicesLookUp = vi.fn(lookUpVoices);
  const voices = new Voices({
    voices: voicesLookUp,
    synthesize: async () => new Uint8Array(),
  });
  const devicesLookUp = vi.fn(lookUpDevices);
  const devices = new Listing(devicesLookUp);
  const setPluginSettings = vi.fn(async () => {});
  const defaults = new DefaultsStore(
    { setPluginSettings },
    () => void channel.publish(),
  );
  const channel = new EditorChannel(
    { sendToEditor: (message) => sent.push(message) },
    defaults,
    voices,
    devices,
  );
  const last = () => sent.at(-1)?.status;
  return {
    channel,
    defaults,
    sent,
    last,
    setPluginSettings,
    voicesLookUp,
    devicesLookUp,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("EditorChannel", () => {
  it("tells an editor the defaults, the Default Voice, every Voice and every device", async () => {
    const { channel, defaults, last } = setup();
    defaults.load({});

    await channel.handle({ event: "get-status" });

    expect(last()).toEqual({
      defaults: INITIAL_DEFAULTS,
      // Nothing chosen yet: the OS's own voice.
      defaultVoice: { id: "milena", name: "Milena" },
      voices: [
        { id: "ava", label: "Ava (Premium) — English (United States)" },
        { id: "milena", label: "Milena — Russian (Russia)" },
      ],
      // In the OS's order, as the host's Play Sound lists them.
      devices: [blackHole, speakers],
    });
  });

  it("looks the voices and devices up afresh when an editor opens, not on every change", async () => {
    const { channel, defaults, voicesLookUp, devicesLookUp } = setup();
    defaults.load({});

    await channel.handle({ event: "get-status" });
    await channel.handle({ event: "get-status" });
    await channel.handle({ event: "set-defaults", defaults: INITIAL_DEFAULTS });
    await settle();

    expect(voicesLookUp).toHaveBeenCalledTimes(2);
    expect(devicesLookUp).toHaveBeenCalledTimes(2);
  });

  it("names the chosen Default Voice, or only its id when it is not here", async () => {
    const { channel, defaults, last } = setup();

    defaults.load({ defaults: { voice: "ava" } });
    await channel.handle({ event: "get-status" });
    expect(last()?.defaultVoice).toEqual({ id: "ava", name: "Ava (Premium)" });

    defaults.load({ defaults: { voice: "gone" } });
    await channel.handle({ event: "get-status" });
    expect(last()?.defaultVoice).toEqual({ id: "gone" });
  });

  it("saves the Plugin Editor's defaults and tells every editor", async () => {
    const { channel, defaults, last, setPluginSettings } = setup();
    defaults.load({});

    await channel.handle({
      event: "set-defaults",
      defaults: {
        voice: "ava",
        rate: 1.5,
        volume: 40,
        device: blackHole,
        lengthLimit: null,
      },
    });
    await settle();

    expect(setPluginSettings).toHaveBeenCalledWith({
      defaults: {
        voice: "ava",
        rate: 1.5,
        volume: 40,
        device: blackHole,
        lengthLimit: null,
      },
    });
    expect(last()).toMatchObject({
      defaults: { voice: "ava", rate: 1.5 },
      defaultVoice: { id: "ava", name: "Ava (Premium)" },
    });
  });

  it("answers only once the saved defaults are in", async () => {
    const { channel, defaults, sent } = setup();

    const answered = channel.handle({ event: "get-status" });
    await settle();
    expect(sent).toHaveLength(0);

    defaults.load({ defaults: { volume: 20 } });
    await answered;
    expect(sent[0].status.defaults.volume).toBe(20);
  });

  it("says why there are no voices or devices when the Provider or the Player cannot list them", async () => {
    const reason = "Text to Speech does not speak on Windows yet";
    const { channel, defaults, last } = setup({
      lookUpVoices: async () => {
        throw new ProviderError("unavailable", reason);
      },
      lookUpDevices: async () => {
        throw new PlayerError("unavailable", reason);
      },
    });
    defaults.load({});

    await channel.handle({ event: "get-status" });

    expect(last()).toEqual({
      defaults: INITIAL_DEFAULTS,
      voices: [],
      voicesProblem: reason,
      devices: [],
      devicesProblem: reason,
    });
  });
});
