import { ensureSchema, json, options, requireDb } from "./_shared.js";

export function onRequestOptions() {
  return options();
}

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env);
    await ensureSchema(db);
    return json({ ok: true, app: "Pegu Pagangan Guru", backend: "cloudflare-d1" });
  } catch (error) {
    return json({ ok: false, error: error.message || "Backend tidak tersedia." }, 500);
  }
}
