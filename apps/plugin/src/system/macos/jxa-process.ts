import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { createInterface } from "node:readline";

/** A failure a script reports, or the process's own: a kind and a reason. */
export type EngineFailure = { kind: string; reason: string };

/** One JSON line a script writes, addressed to the request it answers. */
export type Reply = { id: number; error?: EngineFailure } & Record<
  string,
  unknown
>;

/** What the macOS adapters need from a running script. */
export interface Engine {
  /**
   * Sends a request. Every reply carrying its id goes to `listener` until
   * `release(id)`, including the failure that ends it if the process exits.
   */
  request(
    message: Record<string, unknown>,
    listener: (reply: Reply) => void,
  ): number;
  /** Sends a message that expects no reply — only to a process that runs. */
  notify(message: Record<string, unknown>): void;
  release(id: number): void;
}

/** The slice of a child process `JxaProcess` uses. */
export type ChildProcessLike = {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  on(event: "exit", listener: (code: number | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
};

export type Spawn = (command: string, args: string[]) => ChildProcessLike;

/** How many lines of stderr explain a process that died before it was ready. */
const STDERR_KEPT = 5;

/**
 * One of the plugin's JXA scripts, running in a long-lived
 * `osascript -l JavaScript`: an engine starts in 0.3–0.5 s, and answers in
 * milliseconds once warm.
 *
 * Requests and replies are JSON lines. The script announces `{"ready":true}`
 * once it listens; a process that exits before that cannot run here at all
 * (`unavailable`), one that exits afterwards crashed (`transient`). Either
 * way the next request starts it again. Its stderr is the plugin's log.
 */
export class JxaProcess implements Engine {
  readonly #name: string;
  readonly #script: string;
  readonly #spawn: Spawn;
  #child?: ChildProcessLike;
  #ready = false;
  #nextId = 1;
  readonly #listeners = new Map<number, (reply: Reply) => void>();
  #stderr: string[] = [];

  constructor(name: string, script: string, spawnProcess: Spawn = spawnPiped) {
    this.#name = name;
    this.#script = script;
    this.#spawn = spawnProcess;
  }

  request(
    message: Record<string, unknown>,
    listener: (reply: Reply) => void,
  ): number {
    const id = this.#nextId++;
    this.#listeners.set(id, listener);
    this.#write(this.#child ?? this.#start(), { ...message, id });
    return id;
  }

  notify(message: Record<string, unknown>): void {
    if (this.#child) {
      this.#write(this.#child, message);
    }
  }

  release(id: number): void {
    this.#listeners.delete(id);
  }

  #start(): ChildProcessLike {
    this.#ready = false;
    this.#stderr = [];
    const child = this.#spawn("osascript", [
      "-l",
      "JavaScript",
      "-e",
      this.#script,
    ]);
    this.#child = child;
    // A write racing the process's exit fails with EPIPE; the exit itself
    // reports the failure to whoever was waiting.
    child.stdin.on("error", () => {});
    createInterface({ input: child.stdout }).on("line", (line) =>
      this.#receive(line),
    );
    createInterface({ input: child.stderr }).on("line", (line) => {
      this.#stderr = [...this.#stderr, line].slice(-STDERR_KEPT);
      console.error(`[${this.#name}] ${line}`);
    });
    child.on("error", (error) =>
      this.#ended(child, {
        kind: "unavailable",
        reason: `Cannot start osascript: ${error.message}`,
      }),
    );
    child.on("exit", (code) =>
      this.#ended(
        child,
        this.#ready
          ? {
              kind: "transient",
              reason: `The ${this.#name} stopped (exit code ${code}); it starts again with the next request`,
            }
          : {
              kind: "unavailable",
              reason: `The ${this.#name} cannot run on this Mac: ${this.#stderr.join(" ") || `osascript exited with code ${code}`}`,
            },
      ),
    );
    return child;
  }

  #write(child: ChildProcessLike, message: Record<string, unknown>): void {
    child.stdin.write(`${asciiJson(message)}\n`);
  }

  #receive(line: string): void {
    let reply: unknown;
    try {
      reply = JSON.parse(line);
    } catch {
      console.error(`[${this.#name}] not a reply: ${line}`);
      return;
    }
    if (typeof reply !== "object" || reply === null) {
      return;
    }
    if ("ready" in reply) {
      this.#ready = true;
      return;
    }
    if ("id" in reply && typeof reply.id === "number") {
      this.#listeners.get(reply.id)?.(reply as Reply);
    }
  }

  #ended(child: ChildProcessLike, failure: EngineFailure): void {
    // `error` and `exit` can both arrive for one process.
    if (this.#child !== child) {
      return;
    }
    this.#child = undefined;
    const listeners = [...this.#listeners];
    this.#listeners.clear();
    for (const [id, listener] of listeners) {
      listener({ id, error: failure });
    }
  }
}

function spawnPiped(command: string, args: string[]): ChildProcessLike {
  return spawn(command, args, { stdio: "pipe" });
}

/**
 * JSON with every character above ASCII escaped. The script reads stdin in
 * whatever pieces arrive and decodes each piece on its own, so a multi-byte
 * character split between two pieces would be lost — an escaped one cannot
 * be split.
 */
export function asciiJson(message: unknown): string {
  return JSON.stringify(message).replace(
    /[\u007f-￿]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
