import {
  SYSTEM_PROVIDER,
  type EditorMessage,
  type PluginMessage,
  type PluginStatus,
} from "tts-protocol";

import type { SettingsStore } from "../settings/settings-store";
import type { Listing } from "../speech/listing";
import type { Device } from "../speech/player";
import type { Voice } from "../speech/provider";
import type { SpeechQueue } from "../speech/speech-queue";
import type { Voices } from "../speech/voices";
import { listenPhrase, type ListenRequest } from "./listen";
import type { RecentProblems } from "./recent-problems";
import { voiceOptions } from "./voice-options";

interface EditorSender {
  sendToEditor(message: PluginMessage): void;
}

export type EditorChannelOptions = {
  sender: EditorSender;
  settings: SettingsStore;
  /** The `system` Provider's. */
  voices: Voices;
  devices: Listing<Device>;
  queue: Pick<SpeechQueue, "enqueue">;
  problems: Pick<RecentProblems, "list">;
};

/**
 * The sidecar's side of the editors: the Plugin Editor and every Action
 * Editor see one status — the defaults, the Presets, the voices, the output
 * devices and Recent problems — the Plugin Editor changes the defaults and
 * the Presets through it, and either one Listens.
 */
export class EditorChannel {
  readonly #sender: EditorSender;
  readonly #settings: SettingsStore;
  readonly #voices: Voices;
  readonly #devices: Listing<Device>;
  readonly #queue: Pick<SpeechQueue, "enqueue">;
  readonly #problems: Pick<RecentProblems, "list">;

  constructor({
    sender,
    settings,
    voices,
    devices,
    queue,
    problems,
  }: EditorChannelOptions) {
    this.#sender = sender;
    this.#settings = settings;
    this.#voices = voices;
    this.#devices = devices;
    this.#queue = queue;
    this.#problems = problems;
  }

  async handle(message: EditorMessage): Promise<void> {
    await this.#settings.loaded;
    switch (message.event) {
      case "get-status":
        // An editor opening is when a newly installed voice or a device
        // plugged in since should appear.
        await this.publish({ afresh: true });
        return;
      // The store announces each change, and every editor hears it.
      case "set-defaults":
        await this.#settings.setDefaults(message.defaults);
        return;
      case "save-preset":
        await this.#settings.savePreset(message.preset);
        return;
      case "delete-preset":
        await this.#settings.deletePreset(message.id);
        return;
      case "listen":
        await this.#listen(message);
        return;
    }
  }

  /**
   * Tells the editor that asked for Listen `id` why it could not be heard:
   * a Preset, a Voice or a device that is not here, the Provider or the
   * Player out of order. A Listen that was heard, or stopped, is not answered.
   */
  listenFailed(id: string, error: unknown): void {
    this.#sender.sendToEditor({
      event: "listen-failed",
      id,
      problem: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * As Next: never over a viewer's Phrase, never cutting one off. The
   * Defaults are read now, so a Plugin Editor change saved a moment before —
   * a number field saves as the click on Listen leaves it — is heard.
   */
  async #listen({ id, text, settings }: ListenRequest): Promise<void> {
    try {
      const phrase = await listenPhrase(
        {
          id,
          text: typeof text === "string" ? text : "",
          settings: isRecord(settings) ? settings : {},
        },
        this.#settings.defaults,
        { presets: () => this.#settings.presets, voices: this.#voices },
      );
      this.#queue.enqueue(phrase, "next");
    } catch (error) {
      this.listenFailed(id, error);
    }
  }

  /** Tells every open editor how things stand. */
  async publish({ afresh = false } = {}): Promise<void> {
    const voices = afresh ? this.#voices.refresh() : this.#voices.list();
    const devices = afresh ? this.#devices.refresh() : this.#devices.list();
    this.#sender.sendToEditor({
      event: "status",
      status: {
        defaults: this.#settings.defaults,
        presets: [...this.#settings.presets],
        ...status(await settled(voices), await settled(devices)),
        problems: this.#problems.list,
      },
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  voices: { list: Voice[]; problem?: string },
  devices: { list: Device[]; problem?: string },
): Pick<PluginStatus, "providers" | "devices" | "devicesProblem"> {
  return {
    providers: [
      {
        name: SYSTEM_PROVIDER,
        label: "This computer",
        voices: voiceOptions(voices.list),
        ...(voices.problem !== undefined && { problem: voices.problem }),
      },
    ],
    devices: devices.list.map(({ id, name, isDefault }) => ({
      id,
      name,
      ...(isDefault && { isDefault }),
    })),
    ...(devices.problem !== undefined && { devicesProblem: devices.problem }),
  };
}
