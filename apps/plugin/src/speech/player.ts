import type { Audio } from "./provider";

export type PlayOptions = {
  /** 0 to 1, no boost. The Player's, so it behaves the same for every Provider. */
  volume: number;
};

/**
 * A Player plays a Provider's audio — one per OS. `play` settles when the
 * sound has ended. Aborting `signal` stops it at once and rejects with
 * `signal.reason`; an abort is not an error.
 */
export interface Player {
  play(audio: Audio, options: PlayOptions, signal: AbortSignal): Promise<void>;
}

/**
 * Why a Player did not play to the end — the Provider's kinds, with the
 * output device in place of the Voice:
 * - `device-missing` — the output device is not here;
 * - `unavailable` — the Player cannot work until something outside changes;
 * - `transient` — trying again later may work.
 */
export type PlayerErrorKind = "device-missing" | "unavailable" | "transient";

const PLAYER_ERROR_KINDS: readonly string[] = [
  "device-missing",
  "unavailable",
  "transient",
] satisfies PlayerErrorKind[];

/** A Player's failure; `message` is the reason, readable by a person. */
export class PlayerError extends Error {
  constructor(
    readonly kind: PlayerErrorKind,
    reason: string,
  ) {
    super(reason);
    this.name = "PlayerError";
  }
}

export function isPlayerErrorKind(kind: string): kind is PlayerErrorKind {
  return PLAYER_ERROR_KINDS.includes(kind);
}
