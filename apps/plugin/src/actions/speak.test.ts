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
  it("enqueues its text and returns at once, producing nothing", () => {
    const { enqueue, trigger } = setup();

    expect(trigger({ text: "Hello, chat!" })).toBeUndefined();
    expect(enqueue).toHaveBeenCalledWith({ text: "Hello, chat!" });
  });

  it("speaks a number or a boolean a lone reference resolved to", () => {
    const { enqueue, trigger } = setup();

    trigger({ text: 42 });
    trigger({ text: false });

    expect(enqueue.mock.calls).toEqual([[{ text: "42" }], [{ text: "false" }]]);
  });

  it("enqueues an empty Phrase when there is no text, for the Provider to reject", () => {
    const { enqueue, trigger } = setup();

    trigger({});
    trigger(null);
    trigger({ text: { not: "text" } });

    expect(enqueue.mock.calls).toEqual([
      [{ text: "" }],
      [{ text: "" }],
      [{ text: "" }],
    ]);
  });
});
