import { ensureSchema, hashPin, id, json, options, randomSecret, requireDb, requireTeacher, sha256 } from "./_shared.js";

function cleanText(value) {
  return String(value || "").trim();
}

async function createSession(db, teacherId) {
  const token = randomSecret();
  const now = new Date().toISOString();
  await db
    .prepare("INSERT INTO sessions (id, teacher_id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id("ses"), teacherId, await sha256(token), now, now)
    .run();
  return token;
}

export function onRequestOptions() {
  return options();
}

export async function onRequestGet({ request, env }) {
  try {
    const teacher = await requireTeacher(request, env);
    if (!teacher) return json({ ok: false, error: "Sesi tidak valid." }, 401);
    return json({ ok: true, teacher: { id: teacher.id, teacherName: teacher.teacher_name, schoolName: teacher.school_name } });
  } catch (error) {
    return json({ ok: false, error: error.message || "Gagal membaca sesi." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env);
    await ensureSchema(db);
    const payload = await request.json().catch(() => ({}));
    const action = cleanText(payload.action);

    if (action === "logout") {
      const teacher = await requireTeacher(request, env);
      if (teacher) await db.prepare("DELETE FROM sessions WHERE id = ?").bind(teacher.session_id).run();
      return json({ ok: true });
    }

    const teacherName = cleanText(payload.teacherName);
    const schoolName = cleanText(payload.schoolName);
    const pin = cleanText(payload.pin);
    if (!teacherName || !pin || pin.length < 4) {
      return json({ ok: false, error: "Nama guru dan PIN minimal 4 digit wajib diisi." }, 400);
    }

    if (action === "register") {
      const existing = await db
        .prepare("SELECT id FROM teachers WHERE lower(teacher_name) = lower(?) AND lower(school_name) = lower(?)")
        .bind(teacherName, schoolName)
        .first();
      if (existing) return json({ ok: false, error: "Guru dengan nama dan sekolah ini sudah terdaftar." }, 409);

      const teacherId = id("tea");
      const salt = randomSecret();
      const now = new Date().toISOString();
      await db
        .prepare("INSERT INTO teachers (id, teacher_name, school_name, pin_salt, pin_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(teacherId, teacherName, schoolName, salt, await hashPin(pin, salt), now, now)
        .run();
      const token = await createSession(db, teacherId);
      return json({ ok: true, token, teacher: { id: teacherId, teacherName, schoolName }, state: null });
    }

    if (action === "login") {
      const teacher = await db
        .prepare("SELECT * FROM teachers WHERE lower(teacher_name) = lower(?) AND lower(school_name) = lower(?)")
        .bind(teacherName, schoolName)
        .first();
      if (!teacher || teacher.pin_hash !== await hashPin(pin, teacher.pin_salt)) {
        return json({ ok: false, error: "Nama guru, sekolah, atau PIN tidak cocok." }, 401);
      }
      const token = await createSession(db, teacher.id);
      const saved = await db.prepare("SELECT state_json FROM teacher_states WHERE teacher_id = ?").bind(teacher.id).first();
      return json({
        ok: true,
        token,
        teacher: { id: teacher.id, teacherName: teacher.teacher_name, schoolName: teacher.school_name },
        state: saved?.state_json ? JSON.parse(saved.state_json) : null
      });
    }

    return json({ ok: false, error: "Aksi auth tidak dikenal." }, 400);
  } catch (error) {
    return json({ ok: false, error: error.message || "Auth gagal." }, 500);
  }
}
