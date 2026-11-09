import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: process.env.APP_WORKER_NAME || "mazra",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-30",
    compatibilityFlags: ["nodejs_compat"],
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: { enabled: true, invocationLogs: true },
      traces: { enabled: true, headSamplingRate: 0.1 },
    },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
    },
  }),
});
