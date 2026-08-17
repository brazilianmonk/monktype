import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes all asset paths relative, so the built site works on
// GitHub Pages under any subpath (https://<user>.github.io/<repo>/).
export default defineConfig({
  plugins: [react()],
  base: "./",
});
