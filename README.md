# Pegu - Pegangan Guru

MVP aplikasi pribadi guru berdasarkan PRD `PRD_MVP_Peru_Pegangan_Guru.md`.

## Scope tahap ini

- Dashboard kerja harian
- Jadwal mengajar mingguan semester
- Manajemen kelas
- Manajemen siswa
- Absensi
- Penilaian
- Jurnal mengajar
- Rekap sederhana
- Activity log lokal
- Export CSV
- Backup dan restore JSON
- Backend lokal Node.js
- Penyimpanan utama ke file JSON lokal
- Fallback penyimpanan browser dengan `localStorage`

Login dan sinkronisasi cloud belum dibuat pada tahap ini.

## Menjalankan lokal

```bash
node dev-server.cjs
```

Buka:

```text
http://127.0.0.1:5174
```

Backend lokal tersedia di server yang sama:

```text
GET  http://127.0.0.1:5174/api/health
GET  http://127.0.0.1:5174/api/state
PUT  http://127.0.0.1:5174/api/state
POST http://127.0.0.1:5174/api/reset
```

Data backend lokal multi-user disimpan di:

```text
data/pegu-teachers.json
data/teacher-states/<teacher_id>.json
```

Backend online menggunakan Cloudflare Pages Functions + D1 dengan binding `DB`.

File utama:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.json`
- `sw.js`
- `dev-server.cjs`
