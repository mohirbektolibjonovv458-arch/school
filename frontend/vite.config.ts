import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, createReadStream, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Yuzni aniqlash modellari (face-api): dev'da node_modules'dan beriladi, build'da /models ga ko'chiriladi
const MODEL_DIR = resolve(__dirname, "node_modules/@vladmandic/face-api/model");
const MODELS = ["tiny_face_detector_model", "face_landmark_68_model", "face_recognition_model"].flatMap((m) => [
  `${m}-weights_manifest.json`,
  `${m}.bin`,
]);

function faceModels(): Plugin {
  return {
    name: "schoolpro-face-models",
    configureServer(server) {
      server.middlewares.use("/models", (req, res, next) => {
        const name = (req.url || "").replace(/^\//, "").split("?")[0];
        if (!MODELS.includes(name)) return next();
        res.setHeader("Content-Type", name.endsWith(".json") ? "application/json" : "application/octet-stream");
        createReadStream(resolve(MODEL_DIR, name)).pipe(res);
      });
    },
    writeBundle(options) {
      const out = resolve(options.dir!, "models");
      if (!existsSync(out)) mkdirSync(out, { recursive: true });
      for (const f of MODELS) copyFileSync(resolve(MODEL_DIR, f), resolve(out, f));
    },
  };
}

export default defineConfig({
  plugins: [react(), faceModels()],
  build: {
    outDir: "../backend/frontend_build",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
  },
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
