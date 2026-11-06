import type { NextConfig } from "next";
const instance = process.env.APP_DEV_INSTANCE;
if (instance && !/^[a-z][a-z0-9-]{1,50}$/.test(instance)) throw new Error("Identitas server lokal tidak valid.");
const config: NextConfig = {
  agentRules: false,
  distDir: instance ? `.next/clients/${instance}` : ".next",
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
};
export default config;
