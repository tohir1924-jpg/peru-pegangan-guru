import { json, options, requireDb, requireTeacher } from "./_shared.js";

export function onRequestOptions() {
  return options();
}

export async function onRequestGet({ request, env }) {
  try {
    const teacher = await requireTeacher(request, env);
    if (!teacher) return json({ ok: false, error: "Login diperlukan." }, 401);
    const db = requireDb(env);
    const saved = await db.prepare("SELECT state_json, updated_at FROM teacher_states WHERE teacher_id = ?").bind(teacher.id).first();
    return json({ ok: true, state: saved?.state_json ? JSON.parse(saved.state_json) : null, updatedAt: saved?.updated_at || null });
  } catch (error) {
    return json({ ok: false, error: error.message || "Gagal membaca data." }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const teacher = await requireTeacher(request, env);
    if (!teacher) return json({ ok: false, error: "Login diperlukan." }, 401);

    const state = await request.json().catch(() => null);
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      return json({ ok: false, error: "Payload state tidak valid." }, 400);
    }

    const db = requireDb(env);
    const now = new Date().toISOString();
    await db
      .prepare(`
        INSERT INTO teacher_states (teacher_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(teacher_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
      `)
      .bind(teacher.id, JSON.stringify(state), now)
      .run();
    return json({ ok: true, savedAt: now });
  } catch (error) {
    return json({ ok: false, error: error.message || "Gagal menyimpan data." }, 500);
  }
}
