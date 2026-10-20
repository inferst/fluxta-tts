import type { EditorMessage, PluginMessage, PluginStatus } from "tts-protocol";

import type { Voice } from "../speech/provider";
import { osDefaultOf, type Voices } from "../speech/voices";
import type { DefaultsStore } from "../settings/defaults-store";
import { voiceName, voiceOptions } from "./voice-options";

interface EditorSender {
  sendToEditor(message: PluginMessage): void;
}

/**
 * The sidecar's side of the editors: the Plugin Editor and every Action
 * Editor see one status — the defaults and the voices — and the Plugin
 * Editor changes the defaults through it.
 */
export class EditorChannel {
  readonly #sender: EditorSender;
  readonly #defaults: DefaultsStore;
  readonly #voices: Voices;

  constructor(sender: EditorSender, defaults: DefaultsStore, voices: Voices) {
    this.#sender = sender;
    this.#defaults = defaults;
    this.#voices = voices;
  }

  async handle(message: EditorMessage): Promise<void> {
    await this.#defaults.loaded;
    switch (message.event) {
      case "get-status":
        // An editor opening is when a newly installed voice should appear.
        await this.publish(this.#voices.refresh());
        return;
      case "set-defaults":
        // The store announces the change, and every editor hears it.
        await this.#defaults.set(message.defaults);
        return;
    }
  }

  /** Tells every open editor how things stand. */
  async publish(voices: Promise<Voice[]> = this.#voices.list()): Promise<void> {
    this.#sender.sendToEditor({
      event: "status",
      status: status(this.#defaults.current, await settled(voices)),
    });
  }
}

/** The voices, or why there are none to list. */
async function settled(
  voices: Promise<Voice[]>,
): Promise<{ voices: Voice[]; problem?: string }> {
  try {
    return { voices: await voices };
  } catch (error) {
    return {
      voices: [],
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}

function status(
  defaults: PluginStatus["defaults"],
  { voices, problem }: { voices: Voice[]; problem?: string },
): PluginStatus {
  const id = defaults.voice ?? osDefaultOf(voices)?.id;
  const voice = voices.find((candidate) => candidate.id === id);
  return {
    defaults,
    ...(id !== undefined && {
      defaultVoice: { id, ...(voice && { name: voiceName(voice) }) },
    }),
    voices: voiceOptions(voices),
    ...(problem !== undefined && { voicesProblem: problem }),
  };
}
