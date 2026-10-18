import { PlayerError, type Player } from "./player";
import { ProviderError, type Provider } from "./provider";

/** One Speak's text as accepted into the Speech Queue. */
export type Phrase = {
  /** What it says, after interpolation. */
  text: string;
};

export type SpeechQueueOptions = {
  provider: Provider;
  player: Player;
  /** The id of the Voice a Phrase is spoken with. */
  voiceFor: (phrase: Phrase) => Promise<string>;
  /** A Phrase that could not be spoken, and why. The queue moves on. */
  onDropped: (phrase: Phrase, error: unknown) => void;
};

/** The voice's normal pace and full volume. */
const RATE = 1;
const VOLUME = 1;

/**
 * The plugin's single Speech Queue: Phrases are spoken strictly one at a
 * time, in the order they arrived, whatever started them.
 *
 * The queue owns the order, not the host. Speak only enqueues and returns,
 * so the 30-second action timeout never cuts a Phrase short, and a burst of
 * chat messages from an Event whose runs execute in parallel still waits its
 * turn. It lives in memory: a restart loses whatever was waiting.
 */
export class SpeechQueue {
  readonly #options: SpeechQueueOptions;
  readonly #waiting: Phrase[] = [];
  #current?: { phrase: Phrase; abort: AbortController };

  constructor(options: SpeechQueueOptions) {
    this.#options = options;
  }

  /** Accepts a Phrase at the end of the queue, without waiting for it. */
  enqueue(phrase: Phrase): void {
    this.#waiting.push(phrase);
    this.#next();
  }

  /** How many Phrases wait — the one being spoken not counted. */
  get waiting(): number {
    return this.#waiting.length;
  }

  /**
   * Whether a Phrase is being handled, from the moment it leaves the queue —
   * its synthesis included — until it ends.
   */
  get speaking(): boolean {
    return this.#current !== undefined;
  }

  #next(): void {
    if (this.#current) {
      return;
    }
    const phrase = this.#waiting.shift();
    if (!phrase) {
      return;
    }
    const current = { phrase, abort: new AbortController() };
    this.#current = current;
    void this.#speak(current).finally(() => {
      this.#current = undefined;
      this.#next();
    });
  }

  async #speak({
    phrase,
    abort,
  }: {
    phrase: Phrase;
    abort: AbortController;
  }): Promise<void> {
    const { provider, player, voiceFor, onDropped } = this.#options;
    try {
      const voice = await voiceFor(phrase);
      const audio = await provider.synthesize(
        phrase.text,
        voice,
        { rate: RATE },
        abort.signal,
      );
      await player.play(audio, { volume: VOLUME }, abort.signal);
    } catch (error) {
      // A stopped Phrase was not dropped: someone asked for it.
      if (!abort.signal.aborted) {
        onDropped(phrase, error);
      }
    }
  }
}

/** How much of a dropped Phrase's text goes into its log line. */
const TEXT_SHOWN = 40;

/**
 * The log line for a Phrase that could not be spoken: the reason, then the
 * beginning of its text — enough to find the viewer's message that was lost.
 */
export function describeDrop(phrase: Phrase, error: unknown): string {
  const reason =
    error instanceof ProviderError || error instanceof PlayerError
      ? `${error.kind} — ${error.message}`
      : `unavailable — ${error instanceof Error ? error.message : String(error)}`;
  const graphemes = Array.from(
    new Intl.Segmenter().segment(phrase.text),
    ({ segment }) => segment,
  );
  const text =
    graphemes.length > TEXT_SHOWN
      ? `${graphemes.slice(0, TEXT_SHOWN).join("")}…`
      : phrase.text;
  return `Phrase dropped: ${reason}: "${text}"`;
}
