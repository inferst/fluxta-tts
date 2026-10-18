import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isPlayerErrorKind,
  PlayerError,
  type PlayOptions,
  type Player,
} from "../../speech/player";
import type { Audio } from "../../speech/provider";
import { wavDuration } from "../../speech/wav";
import { JxaProcess, type Engine, type EngineFailure } from "./jxa-process";
import player from "./player.jxa";

/**
 * How long past its own length a play may go before it counts as lost. The
 * end arrives ~50 ms after the sound, ~150 ms when the engine starts cold; a
 * play that never reports it — AVFAudio's callbacks rest on undocumented JXA
 * behaviour — must not hold the Speech Queue forever.
 */
const END_GRACE_MS = 5000;

/**
 * The macOS Player: AVAudioEngine through a long-lived JXA script, on the
 * system default output. Each Phrase goes to the script as a WAV file in a
 * private temporary folder, deleted once it has played.
 */
export class MacosPlayer implements Player {
  readonly #engine: Engine;
  readonly #folder: () => Promise<string>;
  #created?: Promise<string>;

  constructor(
    engine: Engine = new JxaProcess("player", player),
    folder: () => Promise<string> = () =>
      mkdtemp(join(tmpdir(), "fluxta-tts-")),
  ) {
    this.#engine = engine;
    this.#folder = folder;
  }

  async play(
    audio: Audio,
    { volume }: PlayOptions,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    this.#created ??= this.#folder();
    const path = join(await this.#created, `${randomUUID()}.wav`);
    await writeFile(path, audio);
    try {
      signal.throwIfAborted();
      await this.#play(path, volume, wavDuration(audio), signal);
    } finally {
      await rm(path, { force: true });
    }
  }

  #play(
    path: string,
    volume: number,
    seconds: number,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const settle = () => {
        clearTimeout(watchdog);
        this.#engine.release(id);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        this.#engine.notify({ op: "stop", id });
        settle();
        reject(signal.reason);
      };
      const id = this.#engine.request({ op: "play", path, volume }, (reply) => {
        if (reply.error) {
          settle();
          reject(playerError(reply.error));
        } else if (reply.started) {
          watchdog = setTimeout(
            () => {
              this.#engine.notify({ op: "stop", id });
              settle();
              reject(
                new PlayerError(
                  "transient",
                  "The sound never reported its end; it was stopped",
                ),
              );
            },
            seconds * 1000 + END_GRACE_MS,
          );
        } else if (reply.ended) {
          settle();
          resolve();
        }
      });
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

function playerError({ kind, reason }: EngineFailure): PlayerError {
  return new PlayerError(
    isPlayerErrorKind(kind) ? kind : "unavailable",
    reason,
  );
}
