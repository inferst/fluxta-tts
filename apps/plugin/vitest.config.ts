import { defineConfig } from "vitest/config";

import { jxaText } from "./jxa-text.ts";

export default defineConfig({
  plugins: [jxaText()],
});
