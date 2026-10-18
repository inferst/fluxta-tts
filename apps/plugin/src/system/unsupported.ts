import { PlayerError, type Player } from "../speech/player";
import { ProviderError, type Provider } from "../speech/provider";

/**
 * The `system` Provider and Player on an OS they do not cover yet: every
 * Phrase is dropped as `unavailable`, with the reason.
 */
export function unsupported(reason: string): {
  provider: Provider;
  player: Player;
} {
  return {
    provider: {
      voices: () => Promise.reject(new ProviderError("unavailable", reason)),
      synthesize: () =>
        Promise.reject(new ProviderError("unavailable", reason)),
    },
    player: {
      play: () => Promise.reject(new PlayerError("unavailable", reason)),
    },
  };
}
