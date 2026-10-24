import { isBuiltin } from "node:module";

import { defineConfig } from "tsdown";

import { scriptText } from "./script-text.ts";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "../../dist/tts",
  clean: false,
  copy: [
    { from: "../../manifest.json" },
    { from: "../../icons/*.svg", to: "../../dist/tts/icons" },
  ],
  plugins: [scriptText()],
  // Fluxta starts the sidecar with a bundled Node and no node_modules in the
  // plugin folder, so the entry file must be self-contained. Anything that is
  // not a Node builtin gets inlined — listing packages one by one only fails
  // at runtime, on the machine that installed the plugin.
  noExternal: (id) => !isBuiltin(id),
  onSuccess: "cd ../.. && fluxta restart || true",
});
