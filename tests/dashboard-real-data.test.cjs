const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadApp(initialState) {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const appNode = { innerHTML: "" };
  const body = { lastChild: null, appendChild: (node) => { body.lastChild = node; } };
  const authSession = JSON.stringify({ token: "test-token", teacher: { id: "teacher-test", teacherName: "Bu Sari", schoolName: "SD Contoh" } });
  const sandbox = {
    console,
    structuredClone,
    localStorage: {
      getItem: (key) => key === "pegu_teacher_session_v1" ? authSession : JSON.stringify(initialState),
      setItem: () => {}
    },
    sessionStorage: { getItem: () => "", setItem: () => {} },
    location: { hash: "" },
    window: { addEventListener: () => {}, clearTimeout: () => {}, setTimeout: () => {} },
    navigator: {},
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => appNode,
      createElement: () => ({
        innerHTML: "",
        className: "",
        remove: () => {},
        addEventListener: () => {},
        querySelector: () => ({ addEventListener: () => {} }),
        querySelectorAll: () => []
      }),
      body
    },
    setTimeout: () => {},
    fetch: async () => ({ ok: true, json: async () => ({}) })
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { sandbox, appNode };
}

const baseState = {
  settings: {
    teacherName: "Bu Sari",
    schoolName: "SD Contoh",
    mainSubject: "Matematika",
    activeAcademicYear: "2025/2026",
    activeSemester: "Ganjil"
  },
  classes: [
    { id: "class-a", name: "V A", academicYear: "2025/2026", subject: "Matematika", description: "" }
  ],
  students: [
    { id: "stu-1", classId: "class-a", name: "Ahmad Data", nis: "1", gender: "L", parentPhone: "", notes: "" },
    { id: "stu-2", classId: "class-a", name: "Budi Nilai", nis: "2", gender: "L", parentPhone: "", notes: "" },
    { id: "stu-3", classId: "class-a", name: "Citra Catatan", nis: "3", gender: "P", parentPhone: "", notes: "Sering tidak membawa tugas" }
  ],
  attendanceSessions: [{ id: "att-1", classId: "class-a", date: "2026-05-26", notes: "" }],
  attendanceRecords: [
    { id: "rec-1", sessionId: "att-1", studentId: "stu-1", status: "Alpha", notes: "" },
    { id: "rec-2", sessionId: "att-1", studentId: "stu-2", status: "Hadir", notes: "" }
  ],
  assessments: [{ id: "asm-1", classId: "class-a", title: "UH Pecahan", category: "UH", date: "2026-05-26" }],
  assessmentScores: [
    { id: "score-1", assessmentId: "asm-1", studentId: "stu-2", score: "55", notes: "" }
  ],
  journals: [],
  schedules: [
    { id: "sch-1", day: "Rabu", startTime: "07.00", endTime: "08.10", classId: "class-a", subject: "IPA Data", room: "Ruang 5", status: "Berlangsung" },
    { id: "sch-2", day: "Selasa", startTime: "09.00", endTime: "10.00", classId: "class-a", subject: "Besok", room: "Ruang 7", status: "Besok" }
  ],
  activityLogs: [
    { id: "log-1", type: "check", title: "Absensi V A disimpan", desc: "2026-05-26", createdAt: "2026-05-26T07:15:00.000Z" }
  ]
};

const { sandbox, appNode } = loadApp(baseState);
const html = sandbox.renderDashboard();

assert(html.includes("IPA Data"), "dashboard should render today's schedule from state.schedules");
assert(html.includes("07.00 - 08.10"), "dashboard should render the saved schedule time");
assert(!html.includes("Besok"), "dashboard should not render schedules from another day");
assert(html.includes('data-route="schedules"'), "schedule actions should route to schedule management");
assert(!sandbox.renderSchedules().includes('type="date"'), "schedule management should not require daily date input");
assert(sandbox.renderSchedules().includes("Berlaku sepanjang semester"), "schedule management should explain weekly schedule scope");
sandbox.scheduleModal({ day: "Rabu", startTime: "07.00", endTime: "08.10", classId: "class-a", subject: "IPA Data", room: "Ruang 5" });
const scheduleModalHtml = sandbox.document.body.lastChild.innerHTML;
assert(scheduleModalHtml.includes("Mulai (WIB)"), "schedule form should label start time as WIB");
assert(scheduleModalHtml.includes("Selesai (WIB)"), "schedule form should label end time as WIB");
assert(scheduleModalHtml.includes('name="startHour"'), "schedule form should provide a start hour picker");
assert(scheduleModalHtml.includes('name="startMinute"'), "schedule form should provide a start minute picker");
assert(scheduleModalHtml.includes('value="23"'), "schedule hour picker should support 24-hour values through 23");
assert(!scheduleModalHtml.includes("AM") && !scheduleModalHtml.includes("PM"), "schedule form should not show AM/PM labels");
assert(scheduleModalHtml.includes("Waktu selesai harus setelah waktu mulai"), "schedule form should validate end time after start time");

assert(html.includes("Ahmad Data"), "dashboard should flag students with attendance concerns");
assert(html.includes("1 catatan tidak hadir"), "attendance concern should use the real absent count");
assert(html.includes("Budi Nilai"), "dashboard should flag students with low average scores");
assert(html.includes("Rata-rata 55"), "score concern should use the real average score");
assert(html.includes("Citra Catatan"), "dashboard should flag students with notes");
assert(!html.includes("Raka Aditya"), "dashboard should not render fake attention examples");

assert(html.includes("Absensi V A disimpan"), "dashboard should render real activity logs");
assert(!html.includes("2 jam lalu"), "dashboard should not render hardcoded relative times");

sandbox.render();
assert(appNode.innerHTML.includes('<span class="notif-badge">2</span>'), "notification badge should reflect pending attendance and journal reminders");

const emptyState = {
  ...baseState,
  students: [],
  attendanceSessions: [],
  attendanceRecords: [],
  assessments: [],
  assessmentScores: [],
  schedules: [],
  activityLogs: []
};
const emptyHtml = loadApp(emptyState).sandbox.renderDashboard();
assert(emptyHtml.includes("Belum ada jadwal hari ini"), "dashboard should show an empty state when there are no schedules");
assert(emptyHtml.includes("Tidak ada siswa yang perlu dipantau"), "dashboard should show an empty state when there are no attention items");
assert(emptyHtml.includes("Belum ada aktivitas terbaru"), "dashboard should show an empty state when there are no activity logs");
