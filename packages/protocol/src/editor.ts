import type { SpeakSettings } from "./actions";
import type { Defaults } from "./defaults";

/** A Voice as the editors list it. */
export type VoiceOption = {
  id: string;
  /** `Milena — Russian (Russia)`, with its quality where it has one. */
  label: string;
};

/** An output device as the editors list it, under the name the OS gives it. */
export type DeviceOption = {
  id: string;
  name: string;
  /** The OS's default output right now: where System default plays. */
  isDefault?: boolean;
};

/** What the sidecar tells every open editor. */
export type PluginStatus = {
  /** As saved in Plugin Settings. */
  defaults: Defaults;
  /**
   * The Default Voice as it stands: the one chosen, or the OS's own until
   * one is. `name` is absent when that voice is not on this computer.
   * Absent altogether when there are no voices to choose from.
   */
  defaultVoice?: { id: string; name?: string };
  /** Sorted by language, then name. */
  voices: VoiceOption[];
  /** Why there are no voices to list: the Provider's reason. */
  voicesProblem?: string;
  /** In the OS's order, as the host's Play Sound lists them. */
  devices: DeviceOption[];
  /** Why there are no devices to list: the Player's reason. */
  devicesProblem?: string;
};

/**
 * What a Listen speaks with, read as Speak's Overrides: whatever it leaves
 * out follows the Defaults.
 */
export type ListenSettings = Pick<
  SpeakSettings,
  "voice" | "rate" | "volume" | "device"
>;

/** What an editor asks of the sidecar. */
export type EditorMessage =
  /** The status, with the voices and the devices looked up afresh. */
  | { event: "get-status" }
  /** Saves the Plugin Editor's defaults; the sidecar reads them warily. */
  | { event: "set-defaults"; defaults: Defaults }
  /**
   * Speaks the Voice's name as the form stands. `id` is the editor's own,
   * so that only it hears the answer.
   */
  | { event: "listen"; id: string; settings: ListenSettings };

/** What the sidecar sends the editors — every open one. */
export type PluginMessage =
  | { event: "status"; status: PluginStatus }
  /** The Listen `id` could not be heard, and why. */
  | { event: "listen-failed"; id: string; problem: string };

export function isEditorMessage(message: unknown): message is EditorMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const { event } = message as { event?: unknown };
  return (
    event === "get-status" || event === "set-defaults" || event === "listen"
  );
}

export function isListenFailed(
  message: unknown,
): message is Extract<PluginMessage, { event: "listen-failed" }> {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { event?: unknown }).event === "listen-failed"
  );
}
