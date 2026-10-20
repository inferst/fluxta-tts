import { PlayerError, type Player } from "./player";
import { ProviderError, type Provider } from "./provider";

/** One Speak's text as accepted into the Speech Queue. */
export type Phrase = {
  /** What it says, after interpolation. */
  text: string;
  /**
   * What Stop Speech can address it by, compared exactly. Never empty
   * strings: a Tag nothing can address is discarded before it gets here.
   */
  tags: readonly string[];
  /** A Voice's id, or absent for the one `voiceFor` picks. */
  voice?: string;
  /** A multiplier, 1 being the voice's normal pace. */
  rate: number;
  /** 0–1, the Player's. */
  volume: number;
};

/**
 * Where a Phrase goes: **In turn** to the end of the queue, **Next** ahead of
 * every In turn Phrase but behind the other Next ones, **Now** in place of
 * the current Phrase, which it cuts off.
 */
export type Position = "in-turn" | "next" | "now";

export type SpeechQueueOptions = {
  provider: Provider;
  player: Player;
  /** The id of the Voice a Phrase is spoken with. */
  voiceFor: (phrase: Phrase) => Promise<string>;
  /** A Phrase that could not be spoken, and why. The queue moves on. */
  onDropped: (phrase: Phrase, error: unknown) => void;
  /** A Phrase's sound has started. */
  onStarted: (phrase: Phrase) => void;
  /**
   * A Phrase that started has ended, however it ended — spoken to the end,
   * cut off by Stop Speech or a Now, or by the Player failing. Called exactly
   * once for every `onStarted`, so whatever a scenario shows on Phrase
   * Started is never left stuck.
   */
  onFinished: (phrase: Phrase) => void;
};

/** The Phrase being handled: synthesized, then played. */
type Current = {
  phrase: Phrase;
  abort: AbortController;
  /** Once its Phrase Finished, if any, has gone out. Never rejects. */
  settled: Promise<void>;
};

/**
 * The plugin's single Speech Queue: Phrases are spoken strictly one at a
 * time, in the order their Position gives them, whatever started them.
 *
 * The queue owns the order, not the host. Speak only enqueues and returns,
 * so the 30-second action timeout never cuts a Phrase short, and a burst of
 * chat messages from an Event whose runs execute in parallel still waits its
 * turn. Urgency lives here for the same reason: a Now takes the current
 * Phrase's place within the Speak that asked for it — "skip, then Speak" as
 * two Actions would let the queue start its next Phrase in between. It lives
 * in memory: a restart loses whatever was waiting.
 */
export class SpeechQueue {
  readonly #options: SpeechQueueOptions;
  /** Next Phrases, in the order they arrived. */
  #ahead: Phrase[] = [];
  /** In turn Phrases, in the order they arrived. */
  #inTurn: Phrase[] = [];
  #current?: Current;

  constructor(options: SpeechQueueOptions) {
    this.#options = options;
  }

  /** Accepts a Phrase where its Position puts it, without waiting for it. */
  enqueue(phrase: Phrase, position: Position = "in-turn"): void {
    if (position === "now") {
      const cutOff = this.#current;
      cutOff?.abort.abort();
      this.#start(phrase, cutOff?.settled);
      return;
    }
    (position === "next" ? this.#ahead : this.#inTurn).push(phrase);
    this.#advance();
  }

  /** Cuts off the current Phrase; the queue goes on with the next one. */
  stopCurrent(): void {
    this.#current?.abort.abort();
  }

  /** Cuts off the current Phrase and empties the queue, Next included. */
  stopEverything(): void {
    this.#ahead = [];
    this.#inTurn = [];
    this.#current?.abort.abort();
  }

  /**
   * Takes every waiting Phrase carrying `tag` out of the queue, and cuts off
   * the current one if it carries it too.
   */
  stopTagged(tag: string): void {
    const untagged = (phrase: Phrase) => !phrase.tags.includes(tag);
    this.#ahead = this.#ahead.filter(untagged);
    this.#inTurn = this.#inTurn.filter(untagged);
    if (this.#current && !untagged(this.#current.phrase)) {
      this.#current.abort.abort();
    }
  }

  /** How many Phrases wait — the one being spoken not counted. */
  get waiting(): number {
    return this.#ahead.length + this.#inTurn.length;
  }

  /**
   * Whether a Phrase is being handled, from the moment it leaves the queue —
   * its synthesis included — until it ends.
   */
  get speaking(): boolean {
    return this.#current !== undefined;
  }

  #advance(): void {
    if (this.#current) {
      return;
    }
    const phrase = this.#ahead.shift() ?? this.#inTurn.shift();
    if (phrase) {
      this.#start(phrase);
    }
  }

  /**
   * Makes `phrase` the current Phrase at once. A Now passes the Phrase it cut
   * off as `after`: it is spoken only once that one has ended, so the Phrase
   * Finished of the one goes out before the Phrase Started of the other.
   */
  #start(phrase: Phrase, after?: Promise<void>): void {
    const abort = new AbortController();
    const current: Current = {
      phrase,
      abort,
      settled: this.#speak(phrase, abort.signal, after),
    };
    this.#current = current;
    void current.settled.then(() => {
      // A Now that took its place is the current Phrase already.
      if (this.#current === current) {
        this.#current = undefined;
        this.#advance();
      }
    });
  }

  async #speak(
    phrase: Phrase,
    signal: AbortSignal,
    after?: Promise<void>,
  ): Promise<void> {
    const { provider, player, voiceFor, onDropped, onStarted, onFinished } =
      this.#options;
    let started = false;
    let ended = false;
    try {
      await after;
      signal.throwIfAborted();
      const voice = await voiceFor(phrase);
      signal.throwIfAborted();
      const audio = await provider.synthesize(
        phrase.text,
        voice,
        { rate: phrase.rate },
        signal,
      );
      await player.play(
        audio,
        {
          volume: phrase.volume,
          // Once, and never after the play has settled — whatever the
          // Player does, a Phrase starts at most once.
          onStarted: () => {
            if (started || ended) {
              return;
            }
            started = true;
            notify(() => onStarted(phrase));
          },
        },
        signal,
      );
    } catch (error) {
      // A stopped Phrase was not dropped: someone asked for it.
      if (!signal.aborted) {
        notify(() => onDropped(phrase, error));
      }
    } finally {
      ended = true;
      if (started) {
        notify(() => onFinished(phrase));
      }
    }
  }
}

/**
 * Runs a listener without letting it break the queue: a Player calls back
 * from wherever its sound is reported, and the queue must go on whatever a
 * listener does.
 */
function notify(listener: () => void): void {
  try {
    listener();
  } catch (error) {
    console.error("A Speech Queue listener failed:", error);
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
