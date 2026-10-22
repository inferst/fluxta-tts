import type { EditorMessage, PluginMessage, PluginStatus } from "tts-protocol";

import type { Listing } from "../speech/listing";
import type { Device } from "../speech/player";
import type { Voice } from "../speech/provider";
import { osDefaultOf, type Voices } from "../speech/voices";
import type { DefaultsStore } from "../settings/defaults-store";
import { voiceName, voiceOptions } from "./voice-options";

interface EditorSender {
  sendToEditor(message: PluginMessage): void;
}

/**
 * The sidecar's side of the editors: the Plugin Editor and every Action
 * Editor see one status — the defaults, the voices and the output devices —
 * and the Plugin Editor changes the defaults through it.
 */
export class EditorChannel {
  readonly #sender: EditorSender;
  readonly #defaults: DefaultsStore;
  readonly #voices: Voices;
  readonly #devices: Listing<Device>;

  constructor(
    sender: EditorSender,
    defaults: DefaultsStore,
    voices: Voices,
    devices: Listing<Device>,
  ) {
    this.#sender = sender;
    this.#defaults = defaults;
    this.#voices = voices;
    this.#devices = devices;
  }

  async handle(message: EditorMessage): Promise<void> {
    await this.#defaults.loaded;
    switch (message.event) {
      case "get-status":
        // An editor opening is when a newly installed voice or a device
        // plugged in since should appear.
        await this.publish({ afresh: true });
        return;
      case "set-defaults":
        // The store announces the change, and every editor hears it.
        await this.#defaults.set(message.defaults);
        return;
    }
  }

  /** Tells every open editor how things stand. */
  async publish({ afresh = false } = {}): Promise<void> {
    const voices = afresh ? this.#voices.refresh() : this.#voices.list();
    const devices = afresh ? this.#devices.refresh() : this.#devices.list();
    this.#sender.sendToEditor({
      event: "status",
      status: status(
        this.#defaults.current,
        await settled(voices),
        await settled(devices),
      ),
    });
  }
}

/** The list, or why there is none. */
async function settled<T>(
  list: Promise<T[]>,
): Promise<{ list: T[]; problem?: string }> {
  try {
    return { list: await list };
  } catch (error) {
    return {
      list: [],
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}

function status(
  defaults: PluginStatus["defaults"],
  voices: { list: Voice[]; problem?: string },
  devices: { list: Device[]; problem?: string },
): PluginStatus {
  const id = defaults.voice ?? osDefaultOf(voices.list)?.id;
  const voice = voices.list.find((candidate) => candidate.id === id);
  return {
    defaults,
    ...(id !== undefined && {
      defaultVoice: { id, ...(voice && { name: voiceName(voice) }) },
    }),
    voices: voiceOptions(voices.list),
    ...(voices.problem !== undefined && { voicesProblem: voices.problem }),
    devices: devices.list.map(({ id, name, isDefault }) => ({
      id,
      name,
      ...(isDefault && { isDefault }),
    })),
    ...(devices.problem !== undefined && { devicesProblem: devices.problem }),
  };
}
