import { StandaloneTriggerContext } from "@fluxta/sdk/api";
import type { SpeakSettings } from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import type { SpeechQueue } from "../speech/speech-queue";
import { SpeakAction } from "./speak";

function setup() {
  const enqueue = vi.fn();
  const speak = new SpeakAction({ enqueue } as unknown as SpeechQueue);
  const trigger = (settings: unknown) =>
    speak.onTrigger(
      new StandaloneTriggerContext<SpeakSettings>(
        "action-1",
        settings as SpeakSettings,
      ),
    );
  return { enqueue, trigger };
}

describe("Speak", () => {
  it("enqueues its text in turn and returns at once, producing nothing", () => {
    const { enqueue, trigger } = setup();

    expect(trigger({ text: "Hello, chat!" })).toBeUndefined();
    expect(enqueue).toHaveBeenCalledWith(
      { text: "Hello, chat!", tags: [] },
      "in-turn",
    );
  });

  it("speaks a number or a boolean a lone reference resolved to", () => {
    const { enqueue, trigger } = setup();

    trigger({ text: 42 });
    trigger({ text: false });

    expect(enqueue.mock.calls.map(([phrase]) => phrase.text)).toEqual([
      "42",
      "false",
    ]);
  });

  it("enqueues an empty Phrase when there is no text, for the Provider to reject", () => {
    const { enqueue, trigger } = setup();

    trigger({});
    trigger(null);
    trigger({ text: { not: "text" } });

    expect(enqueue.mock.calls).toEqual([
      [{ text: "", tags: [] }, "in-turn"],
      [{ text: "", tags: [] }, "in-turn"],
      [{ text: "", tags: [] }, "in-turn"],
    ]);
  });

  it("puts its Phrase where its Position says, and in turn for anything else", () => {
    const { enqueue, trigger } = setup();

    trigger({ text: "a", position: "next" });
    trigger({ text: "b", position: "now" });
    trigger({ text: "c", position: "in-turn" });
    trigger({ text: "d", position: "first" });

    expect(enqueue.mock.calls.map(([, position]) => position)).toEqual([
      "next",
      "now",
      "in-turn",
      "in-turn",
    ]);
  });

  it("attaches its Tags as they compare: trimmed, a number as its string, case kept", () => {
    const { enqueue, trigger } = setup();

    trigger({
      text: "hi",
      tags: [" user-1 ", 123, "User-1", "123", "msg-9"],
    });

    expect(enqueue.mock.calls[0][0].tags).toEqual([
      "user-1",
      "123",
      "User-1",
      "msg-9",
    ]);
  });

  it("discards a Tag that comes out empty: nothing could address it", () => {
    const { enqueue, trigger } = setup();

    trigger({ text: "hi", tags: ["", "   ", null, { id: 1 }, "user-1"] });
    trigger({ text: "hi", tags: "user-1" });

    expect(enqueue.mock.calls.map(([phrase]) => phrase.tags)).toEqual([
      ["user-1"],
      [],
    ]);
  });
});
