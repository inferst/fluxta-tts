import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlayerError } from "../../speech/player";
import { encodeWav } from "../../speech/wav";
import { FakeEngine } from "../fake-engine";
import { WindowsPlayer } from "./windows-player";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "tts-windows-player-test-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function setup() {
  const engine = new FakeEngine();
  return { engine, player: new WindowsPlayer(engine, async () => folder) };
}

const second = encodeWav(new Float32Array(22_050), 22_050);
const signal = () => new AbortController().signal;

describe("WindowsPlayer", () => {
  it("offers no device but System default, so far", async () => {
    const { engine, player } = setup();

    expect(await player.devices()).toEqual([]);
    expect(engine.requests).toEqual([]);
  });

  it("plays on the system default output at the Phrase's volume, and reports its start and end", async () => {
    const { engine, player } = setup();
    const onStarted = vi.fn();

    const played = player.play(
      second,
      { volume: 0.4, device: "system-default", onStarted },
      signal(),
    );
    await vi.waitFor(() => expect(engine.requests).toHaveLength(1));
    const [{ id, message }] = engine.requests;
    engine.reply(id, { started: true });
    engine.reply(id, { ended: true });

    await played;
    expect(message).toEqual({
      op: "play",
      path: expect.stringMatching(/\.wav$/),
      volume: 0.4,
    });
    expect(onStarted).toHaveBeenCalledOnce();
  });

  it("drops a Phrase for a chosen device, never playing it on the default output", async () => {
    const { engine, player } = setup();

    await expect(
      player.play(
        second,
        {
          volume: 1,
          device: { id: "BlackHole2ch_UID", name: "BlackHole 2ch" },
        },
        signal(),
      ),
    ).rejects.toEqual(
      new PlayerError(
        "device-missing",
        "BlackHole 2ch cannot be chosen: on Windows, Text to Speech plays on the System default output only, for now",
      ),
    );
    expect(engine.requests).toEqual([]);
  });
});
