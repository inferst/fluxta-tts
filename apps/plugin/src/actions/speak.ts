import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { SpeakSettings } from "tts-protocol";

import type { SpeechQueue } from "../speech/speech-queue";

/**
 * Speak: puts its Phrase into the Speech Queue and returns at once. It never
 * waits for the Phrase to be spoken — the run that triggered it moves on.
 */
export class SpeakAction extends StandaloneAction<SpeakSettings> {
  readonly type = "speak";
  readonly #queue: SpeechQueue;

  constructor(queue: SpeechQueue) {
    super();
    this.#queue = queue;
  }

  onTrigger({ settings }: StandaloneTriggerContext<SpeakSettings>): void {
    this.#queue.enqueue({ text: textOf(settings?.text) });
  }
}

/**
 * The text as Fluxta interpolated it. A lone `{{…}}` reference keeps its
 * value's type, so a number or a boolean arrives as itself.
 */
function textOf(value: unknown): string {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : "";
}
