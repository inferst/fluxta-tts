import {
  PlayerError,
  type Device,
  type PlayOptions,
} from "../../speech/player";
import type { Audio } from "../../speech/provider";
import { ScriptPlayer } from "../script-player";
import type { Engine } from "../script-process";
import player from "./player.ps1";
import { PowerShellProcess } from "./powershell-process";

/**
 * The Windows Player: SAPI's `SpeakStream` through a long-lived PowerShell
 * script, on the system default output. It lists no devices of its own yet,
 * so the editors offer System default alone.
 */
export class WindowsPlayer extends ScriptPlayer {
  constructor(
    engine: Engine = new PowerShellProcess("player", player),
    folder?: () => Promise<string>,
  ) {
    super(engine, folder);
  }

  override devices(): Promise<Device[]> {
    return Promise.resolve([]);
  }

  /**
   * A Phrase for a chosen device — a Speak saved on a Mac, say — is dropped,
   * never played on the default output instead: the device decides who
   * hears it.
   */
  override play(
    audio: Audio,
    options: PlayOptions,
    signal: AbortSignal,
  ): Promise<void> {
    if (options.device !== "system-default") {
      return Promise.reject(
        new PlayerError(
          "device-missing",
          `${options.device.name} cannot be chosen: on Windows, Text to Speech plays on the System default output only, for now`,
        ),
      );
    }
    return super.play(audio, options, signal);
  }
}
