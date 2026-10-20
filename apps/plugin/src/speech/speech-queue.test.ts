import { describe, expect, it, vi } from "vitest";

import { PlayerError, type Player } from "./player";
import { ProviderError, type Audio, type Provider } from "./provider";
import { describeDrop, SpeechQueue, type Phrase } from "./speech-queue";

/** A step the test finishes by hand: a synthesis or a play under way. */
type Step = {
  text: string;
  signal: AbortSignal;
  /** A play's sound starts — what the Player reports through `onStarted`. */
  start: () => void;
  finish: () => void;
  fail: (error: unknown) => void;
};

function deferredStep(
  text: string,
  signal: AbortSignal,
  steps: Step[],
  { onStarted = () => {}, settleOnAbort = true } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    steps.push({
      text,
      signal,
      start: onStarted,
      finish: resolve,
      fail: reject,
    });
    // As the real Provider and Player do: an abort rejects with its reason.
    if (settleOnAbort) {
      signal.addEventListener("abort", () => reject(signal.reason));
    }
  });
}

function phrase(text: string, ...tags: string[]): Phrase {
  return { text, tags };
}

/**
 * A queue over a Provider and a Player the test drives by hand. With
 * `settleOnAbort: false` a play goes on after an abort until the test fails
 * it — a Player slow to stop.
 */
function setup({ settleOnAbort = true } = {}) {
  const syntheses: Step[] = [];
  const plays: Step[] = [];
  const provider: Provider = {
    voices: async () => [],
    synthesize: async (text, _voice, _options, signal) => {
      await deferredStep(text, signal, syntheses);
      return new TextEncoder().encode(text);
    },
  };
  const player: Player = {
    play: (audio: Audio, { onStarted }, signal) =>
      deferredStep(new TextDecoder().decode(audio), signal, plays, {
        onStarted,
        settleOnAbort,
      }),
  };
  const dropped: { phrase: Phrase; error: unknown }[] = [];
  /** Phrase Started and Phrase Finished, in the order they were announced. */
  const events: string[] = [];
  const voiceFor = vi.fn(async () => "voice-1");
  const queue = new SpeechQueue({
    provider,
    player,
    voiceFor,
    onDropped: (phrase, error) => dropped.push({ phrase, error }),
    onStarted: (phrase) => events.push(`started ${phrase.text}`),
    onFinished: (phrase) => events.push(`finished ${phrase.text}`),
  });
  return { queue, syntheses, plays, dropped, events, voiceFor };
}

/** Synthesizes the current Phrase and plays it to its end. */
async function speakCurrent(
  syntheses: Step[],
  plays: Step[],
  index: number,
): Promise<void> {
  syntheses[index].finish();
  await settle();
  plays[index].start();
  plays[index].finish();
  await settle();
}

/** Lets the queue's awaited steps run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("SpeechQueue", () => {
  it("speaks Phrases one at a time, in the order they arrived", async () => {
    const { queue, syntheses, plays } = setup();

    queue.enqueue(phrase("one"));
    queue.enqueue(phrase("two"));
    queue.enqueue(phrase("three"));
    await settle();

    expect(syntheses.map(({ text }) => text)).toEqual(["one"]);
    expect(queue.speaking).toBe(true);
    expect(queue.waiting).toBe(2);

    syntheses[0].finish();
    await settle();
    expect(plays.map(({ text }) => text)).toEqual(["one"]);
    // The next Phrase waits until the current one has been heard to the end.
    expect(syntheses).toHaveLength(1);

    plays[0].finish();
    await settle();
    expect(syntheses.map(({ text }) => text)).toEqual(["one", "two"]);
    expect(queue.waiting).toBe(1);

    syntheses[1].finish();
    await settle();
    plays[1].finish();
    await settle();
    syntheses[2].finish();
    await settle();
    plays[2].finish();
    await settle();

    expect(plays.map(({ text }) => text)).toEqual(["one", "two", "three"]);
    expect(queue.speaking).toBe(false);
    expect(queue.waiting).toBe(0);
  });

  it("returns from enqueue before the Phrase is spoken", () => {
    const { queue } = setup();

    queue.enqueue(phrase("hello"));

    expect(queue.speaking).toBe(true);
  });

  it("drops a Phrase whose synthesis fails and moves on", async () => {
    const { queue, syntheses, plays, dropped } = setup();
    queue.enqueue(phrase("unknown voice"));
    queue.enqueue(phrase("next"));
    await settle();

    const error = new ProviderError("voice-missing", "No voice Milena");
    syntheses[0].fail(error);
    await settle();

    expect(dropped).toEqual([{ phrase: phrase("unknown voice"), error }]);
    expect(plays).toHaveLength(0);
    expect(syntheses.map(({ text }) => text)).toEqual([
      "unknown voice",
      "next",
    ]);
  });

  it("drops a Phrase whose playback fails and moves on", async () => {
    const { queue, syntheses, plays, dropped } = setup();
    queue.enqueue(phrase("lost"));
    queue.enqueue(phrase("next"));
    await settle();
    syntheses[0].finish();
    await settle();

    plays[0].fail(new PlayerError("transient", "The output device changed"));
    await settle();

    expect(dropped.map(({ phrase }) => phrase.text)).toEqual(["lost"]);
    expect(syntheses.map(({ text }) => text)).toEqual(["lost", "next"]);
  });

  it("drops a Phrase without a Voice, and anything unexpected, and moves on", async () => {
    const { queue, syntheses, dropped, voiceFor } = setup();
    voiceFor.mockRejectedValueOnce(
      new ProviderError("voice-missing", "This computer has no voices"),
    );
    voiceFor.mockRejectedValueOnce(new TypeError("a bug"));

    queue.enqueue(phrase("first"));
    queue.enqueue(phrase("second"));
    queue.enqueue(phrase("third"));
    await settle();

    expect(dropped.map(({ phrase }) => phrase.text)).toEqual([
      "first",
      "second",
    ]);
    expect(syntheses.map(({ text }) => text)).toEqual(["third"]);
  });

  it("speaks with the Voice it is given, at normal pace and full volume", async () => {
    const synthesize = vi.fn(async () => new Uint8Array());
    const play = vi.fn(async () => {});
    const queue = new SpeechQueue({
      provider: { voices: async () => [], synthesize },
      player: { play },
      voiceFor: async () => "com.apple.voice.compact.ru-RU.Milena",
      onDropped: () => {},
      onStarted: () => {},
      onFinished: () => {},
    });

    queue.enqueue(phrase("Привет"));
    await settle();

    expect(synthesize).toHaveBeenCalledWith(
      "Привет",
      "com.apple.voice.compact.ru-RU.Milena",
      { rate: 1 },
      expect.any(AbortSignal),
    );
    expect(play).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      { volume: 1, onStarted: expect.any(Function) },
      expect.any(AbortSignal),
    );
  });
});

describe("Phrase Started and Phrase Finished", () => {
  it("announce a Phrase when its sound starts and when it ends, one Phrase after another", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("one"));
    queue.enqueue(phrase("two"));
    await settle();

    syntheses[0].finish();
    await settle();
    // Synthesis is not sound: nothing is announced until the Player starts.
    expect(events).toEqual([]);

    plays[0].start();
    expect(events).toEqual(["started one"]);
    plays[0].finish();
    await settle();
    expect(events).toEqual(["started one", "finished one"]);

    await speakCurrent(syntheses, plays, 1);
    expect(events).toEqual([
      "started one",
      "finished one",
      "started two",
      "finished two",
    ]);
  });

  it("finish a Phrase cut off by the Player failing mid-phrase, once", async () => {
    const { queue, syntheses, plays, events, dropped } = setup();
    queue.enqueue(phrase("cut"));
    await settle();
    syntheses[0].finish();
    await settle();

    plays[0].start();
    plays[0].fail(new PlayerError("transient", "The output device changed"));
    await settle();

    expect(events).toEqual(["started cut", "finished cut"]);
    expect(dropped.map(({ phrase }) => phrase.text)).toEqual(["cut"]);
  });

  it("stay silent for a Phrase that never started", async () => {
    const { queue, syntheses, plays, events, dropped } = setup();
    queue.enqueue(phrase("no voice"));
    queue.enqueue(phrase("no device"));
    await settle();

    syntheses[0].fail(new ProviderError("voice-missing", "No voice Milena"));
    await settle();
    syntheses[1].finish();
    await settle();
    plays[0].fail(new PlayerError("unavailable", "No output device"));
    await settle();

    expect(dropped).toHaveLength(2);
    expect(events).toEqual([]);
  });

  it("start a Phrase once, whatever the Player reports", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("once"));
    await settle();
    syntheses[0].finish();
    await settle();

    plays[0].start();
    plays[0].start();
    plays[0].finish();
    await settle();
    plays[0].start();

    expect(events).toEqual(["started once", "finished once"]);
  });

  it("keep the queue going when a listener throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const syntheses: Step[] = [];
    const queue = new SpeechQueue({
      provider: {
        voices: async () => [],
        synthesize: async (text, _voice, _options, signal) => {
          await deferredStep(text, signal, syntheses);
          return new Uint8Array();
        },
      },
      player: {
        play: async (_audio, { onStarted }) => onStarted?.(),
      },
      voiceFor: async () => "voice-1",
      onDropped: () => {},
      onStarted: () => {
        throw new Error("the host went away");
      },
      onFinished: () => {
        throw new Error("the host went away");
      },
    });

    queue.enqueue(phrase("one"));
    queue.enqueue(phrase("two"));
    await settle();
    syntheses[0].finish();
    await settle();

    expect(syntheses.map(({ text }) => text)).toEqual(["one", "two"]);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

/** What a list of steps said, in order. */
const texts = (steps: Step[]) => steps.map(({ text }) => text);

describe("Position", () => {
  it("speaks Next Phrases after the current one, in their own order, before any In turn Phrase", async () => {
    const { queue, syntheses, plays } = setup();
    queue.enqueue(phrase("chat 1"));
    queue.enqueue(phrase("chat 2"));
    queue.enqueue(phrase("redemption 1"), "next");
    queue.enqueue(phrase("chat 3"));
    queue.enqueue(phrase("redemption 2"), "next");
    await settle();
    expect(queue.waiting).toBe(4);

    for (let index = 0; index < 5; index++) {
      await speakCurrent(syntheses, plays, index);
    }

    expect(texts(plays)).toEqual([
      "chat 1",
      "redemption 1",
      "redemption 2",
      "chat 2",
      "chat 3",
    ]);
    // Next never cuts anything off.
    expect(plays.some(({ signal }) => signal.aborted)).toBe(false);
  });

  it("cuts off the current Phrase for a Now, which is spoken at once, and goes on after it", async () => {
    const { queue, syntheses, plays, events, dropped } = setup();
    queue.enqueue(phrase("chat 1"));
    queue.enqueue(phrase("chat 2"));
    queue.enqueue(phrase("redemption"), "next");
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.enqueue(phrase("BRB"), "now");
    // Taken at once: nothing waits in between, and nothing else starts.
    expect([queue.speaking, queue.waiting]).toEqual([true, 2]);
    expect(plays[0].signal.aborted).toBe(true);
    await settle();
    expect(texts(syntheses)).toEqual(["chat 1", "BRB"]);

    await speakCurrent(syntheses, plays, 1);
    await speakCurrent(syntheses, plays, 2);
    await speakCurrent(syntheses, plays, 3);

    // The cut-off Phrase is neither repeated nor dropped.
    expect(texts(syntheses)).toEqual(["chat 1", "BRB", "redemption", "chat 2"]);
    expect(dropped).toEqual([]);
    expect(events).toEqual([
      "started chat 1",
      "finished chat 1",
      "started BRB",
      "finished BRB",
      "started redemption",
      "finished redemption",
      "started chat 2",
      "finished chat 2",
    ]);
  });

  it("speaks a Now at once when nothing is being spoken", async () => {
    const { queue, syntheses } = setup();

    queue.enqueue(phrase("BRB"), "now");
    await settle();

    expect(texts(syntheses)).toEqual(["BRB"]);
  });

  it("speaks a Now only once the Phrase it cut off has ended", async () => {
    const { queue, syntheses, plays, events } = setup({
      settleOnAbort: false,
    });
    queue.enqueue(phrase("chat"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.enqueue(phrase("BRB"), "now");
    await settle();
    // The Player is still stopping "chat": "BRB" waits, so its Phrase
    // Started cannot come before the other's Phrase Finished.
    expect(texts(syntheses)).toEqual(["chat"]);
    expect(queue.speaking).toBe(true);

    plays[0].fail(plays[0].signal.reason);
    await settle();
    expect(texts(syntheses)).toEqual(["chat", "BRB"]);
    await speakCurrent(syntheses, plays, 1);

    expect(events).toEqual([
      "started chat",
      "finished chat",
      "started BRB",
      "finished BRB",
    ]);
  });

  it("lets a Now cut off another Now", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("chat"));
    queue.enqueue(phrase("after"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.enqueue(phrase("first now"), "now");
    queue.enqueue(phrase("second now"), "now");
    await settle();
    // The first one was cut off before it was ever synthesized.
    expect(texts(syntheses)).toEqual(["chat", "second now"]);

    syntheses[1].finish();
    await settle();
    plays[1].start();
    queue.enqueue(phrase("third now"), "now");
    await settle();
    expect(plays[1].signal.aborted).toBe(true);

    await speakCurrent(syntheses, plays, 2);
    await speakCurrent(syntheses, plays, 3);

    expect(texts(syntheses)).toEqual([
      "chat",
      "second now",
      "third now",
      "after",
    ]);
    expect(events).toEqual([
      "started chat",
      "finished chat",
      "started second now",
      "finished second now",
      "started third now",
      "finished third now",
      "started after",
      "finished after",
    ]);
  });
});

describe("Stopping", () => {
  it("cuts off the current Phrase and goes on with the next one", async () => {
    const { queue, syntheses, plays, events, dropped } = setup();
    queue.enqueue(phrase("long"));
    queue.enqueue(phrase("next"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.stopCurrent();
    await settle();

    expect(plays[0].signal.aborted).toBe(true);
    expect(texts(syntheses)).toEqual(["long", "next"]);
    expect(events).toEqual(["started long", "finished long"]);
    // Someone asked for it: a stopped Phrase is not a dropped one.
    expect(dropped).toEqual([]);
  });

  it("aborts the synthesis of a Phrase stopped before its sound, which fires nothing", async () => {
    const { queue, syntheses, plays, events, dropped } = setup();
    queue.enqueue(phrase("slow to synthesize"));
    queue.enqueue(phrase("next"));
    await settle();

    queue.stopCurrent();
    await settle();

    expect(syntheses[0].signal.aborted).toBe(true);
    expect(plays).toHaveLength(0);
    expect(texts(syntheses)).toEqual(["slow to synthesize", "next"]);
    expect([events, dropped]).toEqual([[], []]);
  });

  it("never synthesizes a Phrase stopped while its Voice is looked up", async () => {
    const { queue, syntheses, voiceFor } = setup();
    let voiceFound = () => {};
    voiceFor.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          voiceFound = () => resolve("voice-1");
        }),
    );
    queue.enqueue(phrase("stopped"));
    await settle();

    queue.stopCurrent();
    voiceFound();
    await settle();

    expect(syntheses).toHaveLength(0);
    expect(queue.speaking).toBe(false);
  });

  it("empties the queue, Next included, and cuts off the current Phrase", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("current"));
    queue.enqueue(phrase("chat"));
    queue.enqueue(phrase("redemption"), "next");
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.stopEverything();
    expect(queue.waiting).toBe(0);
    await settle();

    expect([queue.speaking, queue.waiting]).toEqual([false, 0]);
    expect(texts(syntheses)).toEqual(["current"]);
    // Waiting Phrases never started, so they fire nothing.
    expect(events).toEqual(["started current", "finished current"]);
  });

  it("takes a Tag's waiting Phrases out of the queue and cuts off the current one if it carries the Tag", async () => {
    const { queue, syntheses, plays, events } = setup();
    queue.enqueue(phrase("banned 1", "user-1", "message-1"));
    queue.enqueue(phrase("other", "user-2", "message-2"));
    queue.enqueue(phrase("banned 2", "user-1", "message-3"), "next");
    queue.enqueue(phrase("untagged"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.stopTagged("user-1");
    expect(queue.waiting).toBe(2);
    await settle();
    await speakCurrent(syntheses, plays, 1);
    await speakCurrent(syntheses, plays, 2);

    expect(texts(syntheses)).toEqual(["banned 1", "other", "untagged"]);
    expect(events).toEqual([
      "started banned 1",
      "finished banned 1",
      "started other",
      "finished other",
      "started untagged",
      "finished untagged",
    ]);
  });

  it("leaves the current Phrase alone when it does not carry the Tag", async () => {
    const { queue, syntheses, plays } = setup();
    queue.enqueue(phrase("other", "user-2"));
    queue.enqueue(phrase("deleted", "message-1"));
    await settle();
    syntheses[0].finish();
    await settle();

    queue.stopTagged("message-1");

    expect(plays[0].signal.aborted).toBe(false);
    expect(queue.waiting).toBe(0);
  });

  it("matches a Tag exactly, case included", () => {
    const { queue } = setup();
    queue.enqueue(phrase("current"));
    queue.enqueue(phrase("upper", "User-1"));
    queue.enqueue(phrase("longer", "user-10"));

    queue.stopTagged("user-1");
    queue.stopTagged("");

    expect(queue.waiting).toBe(2);
  });

  it("stops a Now that is still waiting for the Phrase it cut off", async () => {
    const { queue, syntheses, plays, events } = setup({
      settleOnAbort: false,
    });
    queue.enqueue(phrase("chat"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();
    queue.enqueue(phrase("BRB", "deck"), "now");

    queue.stopTagged("deck");
    plays[0].fail(plays[0].signal.reason);
    await settle();

    expect(texts(syntheses)).toEqual(["chat"]);
    expect(queue.speaking).toBe(false);
    expect(events).toEqual(["started chat", "finished chat"]);
  });

  it("finishes a Phrase once, however many times it is stopped", async () => {
    const { queue, syntheses, plays, events } = setup({
      settleOnAbort: false,
    });
    queue.enqueue(phrase("stopped", "user-1"));
    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();

    queue.stopCurrent();
    queue.stopTagged("user-1");
    queue.enqueue(phrase("BRB"), "now");
    queue.stopEverything();
    plays[0].fail(plays[0].signal.reason);
    await settle();

    expect(events).toEqual(["started stopped", "finished stopped"]);
    expect(queue.speaking).toBe(false);
  });

  it("does nothing when nothing is being spoken", () => {
    const { queue } = setup();

    queue.stopCurrent();
    queue.stopTagged("user-1");
    queue.stopEverything();

    expect([queue.speaking, queue.waiting]).toEqual([false, 0]);
  });
});

describe("speaking and waiting", () => {
  it("count a Phrase as speaking from synthesis to its end, and the rest as waiting", async () => {
    const { queue, syntheses, plays } = setup();
    expect([queue.speaking, queue.waiting]).toEqual([false, 0]);

    queue.enqueue(phrase("one"));
    queue.enqueue(phrase("two"));
    // Both read the queue as it is right after the Speaks.
    expect([queue.speaking, queue.waiting]).toEqual([true, 1]);

    await settle();
    syntheses[0].finish();
    await settle();
    plays[0].start();
    expect([queue.speaking, queue.waiting]).toEqual([true, 1]);

    plays[0].finish();
    await settle();
    // The next Phrase is taken at once: no moment in between reads idle.
    expect([queue.speaking, queue.waiting]).toEqual([true, 0]);

    await speakCurrent(syntheses, plays, 1);
    expect([queue.speaking, queue.waiting]).toEqual([false, 0]);
  });
});

describe("describeDrop", () => {
  it("names the kind, the reason and the beginning of the text", () => {
    expect(
      describeDrop(
        phrase("Hello chat"),
        new ProviderError("voice-missing", "No voice Milena on this Mac"),
      ),
    ).toBe(
      'Phrase dropped: voice-missing — No voice Milena on this Mac: "Hello chat"',
    );
  });

  it("cuts a long text between graphemes", () => {
    const text = `${"a".repeat(39)}👍🏽 and the rest`;

    expect(
      describeDrop(phrase(text), new PlayerError("transient", "Lost")),
    ).toBe(`Phrase dropped: transient — Lost: "${"a".repeat(39)}👍🏽…"`);
  });

  it("calls an unexpected failure unavailable", () => {
    expect(describeDrop(phrase("x"), new Error("boom"))).toBe(
      'Phrase dropped: unavailable — boom: "x"',
    );
  });
});
