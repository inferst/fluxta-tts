import {
  INITIAL_DEFAULTS,
  LISTEN_TEXT,
  type EditorMessage,
  type PluginMessage,
  type Preset,
} from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import { SettingsStore } from "../settings/settings-store";
import { Listing } from "../speech/listing";
import { PlayerError, type Device, type Player } from "../speech/player";
import { ProviderError, type Provider, type Voice } from "../speech/provider";
import type { SpeechQueue } from "../speech/speech-queue";
import { Voices } from "../speech/voices";
import { EditorChannel } from "./editor-channel";
import { RecentProblems } from "./recent-problems";

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

const chat: Preset = {
  id: "preset-chat",
  name: "Chat",
  voice: { provider: "system", id: "ava", name: "Ava (Premium)" },
  settings: { rate: 1.5 },
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
  const settings = new SettingsStore(
    { setPluginSettings },
    () => void channel.publish(),
    () => "new-preset",
  );
  const enqueue = vi.fn<SpeechQueue["enqueue"]>();
  const problems = new RecentProblems(
    () => void channel.publish(),
    () => 1000,
  );
  const channel = new EditorChannel({
    sender: { sendToEditor: (message) => sent.push(message) },
    settings,
    voices,
    devices,
    queue: { enqueue },
    problems,
  });
  const statuses = () =>
    sent.flatMap((message) =>
      message.event === "status" ? [message.status] : [],
    );
  const last = () => statuses().at(-1);
  return {
    channel,
    settings,
    problems,
    sent,
    statuses,
    last,
    setPluginSettings,
    voicesLookUp,
    devicesLookUp,
    enqueue,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("EditorChannel", () => {
  it("tells an editor the defaults, the Presets, every Voice and every device", async () => {
    const { channel, settings, last } = setup();
    settings.load({ presets: [chat] });

    await channel.handle({ event: "get-status" });

    expect(last()).toEqual({
      defaults: INITIAL_DEFAULTS,
      presets: [chat],
      providers: [
        {
          name: "system",
          label: "This computer",
          voices: [
            {
              id: "ava",
              name: "Ava (Premium)",
              label: "Ava (Premium) — English (United States)",
            },
            {
              id: "milena",
              name: "Milena",
              label: "Milena — Russian (Russia)",
            },
          ],
        },
      ],
      // In the OS's order, as the host's Play Sound lists them.
      devices: [blackHole, speakers],
      problems: [],
    });
  });

  it("looks the voices and devices up afresh when an editor opens, not on every change", async () => {
    const { channel, settings, voicesLookUp, devicesLookUp } = setup();
    settings.load({});

    await channel.handle({ event: "get-status" });
    await channel.handle({ event: "get-status" });
    await channel.handle({ event: "set-defaults", defaults: INITIAL_DEFAULTS });
    await settle();

    expect(voicesLookUp).toHaveBeenCalledTimes(2);
    expect(devicesLookUp).toHaveBeenCalledTimes(2);
  });

  it("saves the Plugin Editor's defaults and tells every editor", async () => {
    const { channel, settings, last, setPluginSettings } = setup();
    settings.load({ presets: [chat] });
    const defaults = {
      preset: { id: chat.id, name: "Chat" },
      volume: 40,
      device: blackHole,
      lengthLimit: null,
    };

    await channel.handle({ event: "set-defaults", defaults });
    await settle();

    expect(setPluginSettings).toHaveBeenCalledWith({
      defaults,
      presets: [chat],
    });
    expect(last()?.defaults).toEqual(defaults);
  });

  it("saves and deletes Presets, and tells every editor", async () => {
    const { channel, settings, last } = setup();
    settings.load({});
    const draft = {
      name: chat.name,
      voice: chat.voice,
      settings: chat.settings,
    };

    await channel.handle({ event: "save-preset", preset: draft });
    await settle();
    expect(last()?.presets).toEqual([{ ...chat, id: "new-preset" }]);

    await channel.handle({ event: "delete-preset", id: "new-preset" });
    await settle();
    expect(last()?.presets).toEqual([]);
  });

  it("answers only once the saved settings are in", async () => {
    const { channel, settings, sent, statuses } = setup();

    const answered = channel.handle({ event: "get-status" });
    await settle();
    expect(sent).toHaveLength(0);

    settings.load({ defaults: { volume: 20 } });
    await answered;
    expect(statuses()[0].defaults.volume).toBe(20);
  });

  it("says why there are no voices or devices when the Provider or the Player cannot list them", async () => {
    const reason = "Text to Speech does not speak on linux";
    const { channel, settings, last } = setup({
      lookUpVoices: async () => {
        throw new ProviderError("unavailable", reason);
      },
      lookUpDevices: async () => {
        throw new PlayerError("unavailable", reason);
      },
    });
    settings.load({});

    await channel.handle({ event: "get-status" });

    expect(last()).toEqual({
      defaults: INITIAL_DEFAULTS,
      presets: [],
      providers: [
        {
          name: "system",
          label: "This computer",
          voices: [],
          problem: reason,
        },
      ],
      devices: [],
      devicesProblem: reason,
      problems: [],
    });
  });

  it("tells every editor of a Phrase dropped, at once", async () => {
    const { channel, settings, problems, last } = setup();
    settings.load({});
    await channel.handle({ event: "get-status" });

    const drop = {
      kind: "device-missing",
      reason: "BlackHole 2ch is not connected",
      text: "Hello chat",
    };
    problems.add(drop);
    await settle();

    expect(last()?.problems).toEqual([{ id: 1, at: 1000, ...drop }]);
  });
});

describe("Listen", () => {
  const text = "Hello";
  const chatRef = { id: chat.id, name: "Chat" };

  it("speaks the typed text as Next, with a Speak's Preset and Overrides, out of scenarios' sight", async () => {
    const { channel, settings, enqueue, sent } = setup();
    settings.load({ presets: [chat] });

    await channel.handle({
      event: "listen",
      id: "l-1",
      text: "Thanks for the follow!",
      settings: { preset: chatRef, volume: 40, device: blackHole },
    });

    expect(enqueue).toHaveBeenCalledWith(
      {
        text: "Thanks for the follow!",
        tags: [],
        preset: chatRef,
        volume: 0.4,
        device: blackHole,
        listen: "l-1",
      },
      "next",
    );
    expect(sent).toEqual([]);
  });

  it("speaks a Preset dialog's unsaved form, with the Defaults' volume and device", async () => {
    const { channel, settings, enqueue } = setup();
    settings.load({ defaults: { volume: 70, device: blackHole } });
    const speech = {
      voice: { provider: "system", id: "milena", name: "Milena" },
      settings: { rate: 0.8 },
    } as const;

    await channel.handle({
      event: "listen",
      id: "l-1",
      text,
      settings: { speech },
    });

    expect(enqueue.mock.calls[0][0]).toEqual({
      text,
      tags: [],
      speech,
      volume: 0.7,
      device: blackHole,
      listen: "l-1",
    });
  });

  it("follows the Defaults for whatever the form leaves out — no Preset while there is no Default Preset", async () => {
    const { channel, settings, enqueue } = setup();
    settings.load({ defaults: { volume: 70, device: blackHole } });

    await channel.handle({ event: "listen", id: "l-1", text, settings: {} });
    await channel.handle({
      event: "listen",
      id: "l-2",
      text,
      settings: { device: "system-default" },
    });

    expect(enqueue.mock.calls.map(([phrase]) => phrase)).toEqual([
      {
        text,
        tags: [],
        volume: 0.7,
        device: blackHole,
        listen: "l-1",
      },
      expect.objectContaining({ device: "system-default" }),
    ]);
  });

  it("hears a Plugin Editor change saved just before the click", async () => {
    const { channel, settings, enqueue } = setup();
    settings.load({});

    void channel.handle({
      event: "set-defaults",
      defaults: { ...INITIAL_DEFAULTS, volume: 30 },
    });
    await channel.handle({ event: "listen", id: "l-1", text, settings: {} });

    expect(enqueue.mock.calls[0][0].volume).toBe(0.3);
  });

  it("says the greeting when the field is blank", async () => {
    const { channel, settings, enqueue } = setup();
    settings.load({});

    await channel.handle({
      event: "listen",
      id: "l-1",
      text: " ",
      settings: {},
    });
    // Read warily, as the settings are.
    await channel.handle({
      event: "listen",
      id: "l-2",
      settings: {},
    } as unknown as EditorMessage);

    expect(enqueue.mock.calls.map(([phrase]) => phrase.text)).toEqual([
      LISTEN_TEXT,
      LISTEN_TEXT,
    ]);
  });

  it("answers the editor that asked when the Preset or its Voice is not here, speaking nothing", async () => {
    const { channel, settings, enqueue, sent } = setup();
    settings.load({
      presets: [
        { ...chat, voice: { provider: "system", id: "gone", name: "Gone" } },
      ],
    });

    await channel.handle({
      event: "listen",
      id: "l-1",
      text,
      settings: { preset: { id: "deleted", name: "Announcer" } },
    });
    await channel.handle({
      event: "listen",
      id: "l-2",
      text,
      settings: { preset: chatRef },
    });
    await channel.handle({
      event: "listen",
      id: "l-3",
      text,
      settings: { speech: { settings: { rate: 1 } } } as never,
    });

    expect(enqueue).not.toHaveBeenCalled();
    expect(sent).toEqual([
      {
        event: "listen-failed",
        id: "l-1",
        problem: "No Preset Announcer on this computer",
      },
      {
        event: "listen-failed",
        id: "l-2",
        problem: "This voice is not on this computer",
      },
      {
        event: "listen-failed",
        id: "l-3",
        problem: "Choose a voice to listen to",
      },
    ]);
  });

  it("answers with the Provider's reason when there are no voices at all", async () => {
    const { channel, settings, sent } = setup({
      lookUpVoices: async () => {
        throw new ProviderError(
          "unavailable",
          "Text to Speech does not speak on linux",
        );
      },
    });
    settings.load({});

    await channel.handle({ event: "listen", id: "l-1", text, settings: {} });

    expect(sent).toEqual([
      {
        event: "listen-failed",
        id: "l-1",
        problem: "Text to Speech does not speak on linux",
      },
    ]);
  });

  it("passes on why a Listen's Phrase was dropped", () => {
    const { channel, sent } = setup();

    channel.listenFailed(
      "l-1",
      new PlayerError("device-missing", "BlackHole 2ch is not connected"),
    );

    expect(sent).toEqual([
      {
        event: "listen-failed",
        id: "l-1",
        problem: "BlackHole 2ch is not connected",
      },
    ]);
  });
});
