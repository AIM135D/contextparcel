import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "ContextParcel",
  short_name: "ContextParcel",
  description: "Local-first context handoff from ChatGPT and web selections to coding agents.",
  version: "0.1.0",
  permissions: ["storage", "contextMenus"],
  host_permissions: ["http://127.0.0.1/*"],
  background: {
    service_worker: "src/background.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content.tsx"],
      run_at: "document_idle"
    }
  ],
  action: {
    default_title: "ContextParcel"
  }
});
