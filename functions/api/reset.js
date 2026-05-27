import { json, options, requireDb, requireTeacher } from "./_shared.js";

export function onRequestOptions() {
  return options();
}

export async function onRequestPost({ request, env }) {
  try {
    const teacher = await requireTeacher(request, env);
    if (!teacher) return json({ ok: false, error: "Login diperlukan." }, 401);
    const db = requireDb(env);
    await db.prepare("DELETE FROM teacher_states WHERE teacher_id = ?").bind(teacher.id).run();
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error.message || "Gagal reset data." }, 500);
  }
}
