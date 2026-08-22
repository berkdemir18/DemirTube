import { build } from "esbuild";

await Promise.all([
  build({
    entryPoints: ["src/background/service-worker.ts"],
    outfile: "dist/assets/background.js",
    bundle: true,
    format: "esm",
    target: "chrome120",
    minify: true
  }),
  // Her youtube.com sayfasında çalışan React'sız çekirdek.
  build({
    entryPoints: ["src/content/index.ts"],
    outfile: "dist/assets/content.js",
    bundle: true,
    format: "iife",
    target: "chrome120",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' }
  }),
  // Yalnızca watch/shorts rotasında chrome.scripting ile enjekte edilen React arayüzü.
  build({
    entryPoints: ["src/content/video-ui.tsx"],
    outfile: "dist/assets/video-ui.js",
    bundle: true,
    format: "iife",
    target: "chrome120",
    jsx: "automatic",
    jsxImportSource: "react",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' }
  }),
  build({
    entryPoints: ["src/content/page-bridge.ts"],
    outfile: "dist/assets/page-bridge.js",
    bundle: true,
    format: "iife",
    target: "chrome120",
    minify: true
  })
]);
