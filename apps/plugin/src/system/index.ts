import type { Player } from "../speech/player";
import type { Provider } from "../speech/provider";
import { MacosPlayer } from "./macos/macos-player";
import { MacosProvider } from "./macos/macos-provider";
import { unsupported } from "./unsupported";

/**
 * The `system` Provider — this computer's voices — and the Player for the OS
 * the sidecar runs on. Another OS's Provider never appears here.
 */
export function systemSpeech(platform: NodeJS.Platform = process.platform): {
  provider: Provider;
  player: Player;
} {
  if (platform === "darwin") {
    return { provider: new MacosProvider(), player: new MacosPlayer() };
  }
  return unsupported(
    platform === "win32"
      ? "Text to Speech does not speak on Windows yet"
      : `Text to Speech does not speak on ${platform}`,
  );
}
