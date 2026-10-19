import {
  StandaloneAction,
  type StandaloneTriggerContext,
} from "@fluxta/sdk/api";
import type { SpeakSettings } from "tts-protocol";

import type { Position, SpeechQueue } from "../speech/speech-queue";
import { tagsOf, textOf } from "./values";

/**
 * Speak: puts its Phrase into the Speech Queue where its Position says, and
 * returns at once. It never waits for the Phrase to be spoken — the run that
 * triggered it moves on.
 */
export class SpeakAction extends StandaloneAction<SpeakSettings> {
  readonly type = "speak";
  readonly #queue: SpeechQueue;

  constructor(queue: SpeechQueue) {
    super();
    this.#queue = queue;
  }

  onTrigger({ settings }: StandaloneTriggerContext<SpeakSettings>): void {
    this.#queue.enqueue(
      { text: textOf(settings?.text), tags: tagsOf(settings?.tags) },
      positionOf(settings?.position),
    );
  }
}

/** In turn unless the Speak asks for more: urgency is never assumed. */
function positionOf(value: unknown): Position {
  return value === "next" || value === "now" ? value : "in-turn";
}
