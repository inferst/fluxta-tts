import { describe, expect, it, vi } from "vitest";

import { PlayerError, type Player } from "./player";
import { ProviderError, type Audio, type Provider } from "./provider";
import { describeDrop, SpeechQueue, type Phrase } from "./speech-queue";

/** A step the test finishes by hand: a synthesis or a play under way. */
type Step = {
  text: string;
  signal: AbortSignal;
  finish: () => void;
  fail: (error: unknown) => void;
};

function deferredStep(
  text: string,
  signal: AbortSignal,
  steps: Step[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    steps.push({ text, signal, finish: resolve, fail: reject });
  });
}

function setup() {
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
    play: (audio: Audio, _options, signal) =>
      deferredStep(new TextDecoder().decode(audio), signal, plays),
  };
  const dropped: { phrase: Phrase; error: unknown }[] = [];
  const voiceFor = vi.fn(async () => "voice-1");
  const queue = new SpeechQueue({
    provider,
    player,
    voiceFor,
    onDropped: (phrase, error) => dropped.push({ phrase, error }),
  });
  return { queue, syntheses, plays, dropped, voiceFor };
}

/** Lets the queue's awaited steps run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("SpeechQueue", () => {
  it("speaks Phrases one at a time, in the order they arrived", async () => {
    const { queue, syntheses, plays } = setup();

    queue.enqueue({ text: "one" });
    queue.enqueue({ text: "two" });
    queue.enqueue({ text: "three" });
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

    queue.enqueue({ text: "hello" });

    expect(queue.speaking).toBe(true);
  });

  it("drops a Phrase whose synthesis fails and moves on", async () => {
    const { queue, syntheses, plays, dropped } = setup();
    queue.enqueue({ text: "unknown voice" });
    queue.enqueue({ text: "next" });
    await settle();

    const error = new ProviderError("voice-missing", "No voice Milena");
    syntheses[0].fail(error);
    await settle();

    expect(dropped).toEqual([{ phrase: { text: "unknown voice" }, error }]);
    expect(plays).toHaveLength(0);
    expect(syntheses.map(({ text }) => text)).toEqual([
      "unknown voice",
      "next",
    ]);
  });

  it("drops a Phrase whose playback fails and moves on", async () => {
    const { queue, syntheses, plays, dropped } = setup();
    queue.enqueue({ text: "lost" });
    queue.enqueue({ text: "next" });
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

    queue.enqueue({ text: "first" });
    queue.enqueue({ text: "second" });
    queue.enqueue({ text: "third" });
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
    });

    queue.enqueue({ text: "Привет" });
    await settle();

    expect(synthesize).toHaveBeenCalledWith(
      "Привет",
      "com.apple.voice.compact.ru-RU.Milena",
      { rate: 1 },
      expect.any(AbortSignal),
    );
    expect(play).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      { volume: 1 },
      expect.any(AbortSignal),
    );
  });
});

describe("describeDrop", () => {
  it("names the kind, the reason and the beginning of the text", () => {
    expect(
      describeDrop(
        { text: "Hello chat" },
        new ProviderError("voice-missing", "No voice Milena on this Mac"),
      ),
    ).toBe(
      'Phrase dropped: voice-missing — No voice Milena on this Mac: "Hello chat"',
    );
  });

  it("cuts a long text between graphemes", () => {
    const text = `${"a".repeat(39)}👍🏽 and the rest`;

    expect(describeDrop({ text }, new PlayerError("transient", "Lost"))).toBe(
      `Phrase dropped: transient — Lost: "${"a".repeat(39)}👍🏽…"`,
    );
  });

  it("calls an unexpected failure unavailable", () => {
    expect(describeDrop({ text: "x" }, new Error("boom"))).toBe(
      'Phrase dropped: unavailable — boom: "x"',
    );
  });
});
