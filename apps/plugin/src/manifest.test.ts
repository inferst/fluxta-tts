import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SpeakAction } from "./actions/speak";
import { StopSpeechAction } from "./actions/stop-speech";
import { PHRASE_FINISHED_EVENT, PHRASE_STARTED_EVENT } from "./events";
import { SPEAKING_SOURCE } from "./sources/speaking";
import { WAITING_SOURCE } from "./sources/waiting";
import type { SpeechQueue } from "./speech/speech-queue";

/** Fluxta drops whatever the manifest does not declare, without a word. */
const manifest = JSON.parse(
  readFileSync(new URL("../../../manifest.json", import.meta.url), "utf8"),
) as {
  actions: { type: string }[];
  sources: { key: string; resolve: string }[];
  events: { type: string; fields?: unknown[] }[];
};

describe("manifest.json", () => {
  it("declares every Action the sidecar registers", () => {
    const queue = {} as SpeechQueue;
    expect(manifest.actions.map(({ type }) => type)).toEqual([
      new SpeakAction(queue).type,
      new StopSpeechAction(queue).type,
    ]);
  });

  it("declares every Source the sidecar answers, as pulled", () => {
    expect(manifest.sources).toEqual([
      expect.objectContaining({ key: SPEAKING_SOURCE, resolve: "query" }),
      expect.objectContaining({ key: WAITING_SOURCE, resolve: "query" }),
    ]);
  });

  it("declares every Event the sidecar emits, without Fields", () => {
    expect(manifest.events).toEqual([
      { type: PHRASE_STARTED_EVENT, name: "Phrase Started" },
      { type: PHRASE_FINISHED_EVENT, name: "Phrase Finished" },
    ]);
  });
});
