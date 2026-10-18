# ITSM Platform — IT Service Management Multi-Industri

Aplikasi web IT Service Management (React + Node.js + MongoDB) yang mengacu pada best practice
**ITIL 4, TOGAF, ITAM (ISO/IEC 19770), NIST CSF 2.0, PMBOK 7, Agile/Scrum**, serta regulasi
Indonesia seperti **PADK OJK No. 1 Tahun 2026** dan **POJK 11/POJK.03/2022** (Penyelenggaraan TI oleh Bank Umum).
Paket regulasi aktif mengikuti **industri** yang dipilih, jadi satu aplikasi bisa dipakai bank, LJK nonbank,
pemerintahan (SPBE), rumah sakit, ritel, manufaktur, dan industri lain.

> ⚠️ Kontrol kepatuhan di aplikasi ini adalah **ringkasan tingkat domain** untuk self-assessment,
> bukan salinan naskah resmi. Tim kepatuhan/legal wajib memverifikasi dan melengkapinya
> terhadap teks resmi (pasal, lampiran, FAQ) sebelum dipakai sebagai dasar audit.

## Modul

| Area | Modul | Acuan |
|---|---|---|
| Service Management | Incident (prioritas impact × urgency, SLA dengan pause/resume, major/security incident, flag pelaporan ke regulator & kebocoran data pribadi) | ITIL 4, NIST CSF RS, UU PDP |
| | Service Request + Portal Layanan (katalog, approval dengan segregation of duties) | ITIL 4 |
| | Problem (RCA 5 Whys/Fishbone/KT, known error, workaround, permanent fix) | ITIL 4 |
| | Change Enablement (standard/normal/emergency, CAB multi-approver untuk risiko tinggi, SoD, backout plan, PIR) | ITIL 4, ISO 27001 A.8.32 |
| | Knowledge Base (review sebelum terbit, penulis tidak boleh menerbitkan artikelnya sendiri) | ITIL 4 |
| | Service Catalog (kritikalitas, target availability, RTO/RPO), SLA Policy | ITIL 4, ISO 20000 |
| Aset & Konfigurasi | CMDB (relasi CI, lokasi DC/DRC, **negara penempatan**, klasifikasi data, data pribadi) | ITIL 4, PADK 1/2026, PP 71/2019 |
| | IT Asset Management (siklus hidup, lisensi, garansi, disposal aman NIST SP 800-88) | ISO/IEC 19770-1 |
| Tata Kelola & Risiko | Vendor / Penyedia Jasa TI (due diligence, right-to-audit, lokasi data, persetujuan offshore, exit strategy) | POJK 11/2022, PADK 1/2026, NIST GV.SC |
| | Risk Register 5×5 (inheren & residual, dipetakan ke fungsi NIST CSF) | ISO 31000, NIST SP 800-30 |
| | Kontrol Kepatuhan + skor per framework | Semua framework aktif |
| | BCP / DRP (RTO/RPO, jadwal & hasil uji) | POJK 11/2022, ISO 27001 A.5.30 |
| Arsitektur & Proyek | Architecture Repository (domain BDAT, ABB/SBB, fase ADM, baseline/target, model TIME) | TOGAF |
| | Proyek (predictive/agile/hybrid, siklus inisiasi→penutupan, lessons learned) | PMBOK 7 |
| | Sprint (goal, review, retrospective) & Product Backlog (board Kanban, story points, MoSCoW) | Scrum Guide 2020 |
| Administrasi | Pengguna & 16 peran (RBAC), Audit Log append-only, Pengaturan industri & framework | ISO 27001 A.8.15, NIST PR.AA |

### Paket regulasi per industri

| Industri | Framework yang diaktifkan otomatis |
|---|---|
| Semua industri (dasar) | ITIL 4, ISO/IEC 20000-1, ISO/IEC 27001:2022, NIST CSF 2.0, ITAM, TOGAF, PMBOK 7, Scrum, UU 27/2022 (PDP), PP 71/2019 (PSTE) |
| Perbankan (Bank Umum) | + POJK 11/POJK.03/2022, **PADK OJK 1/2026**, PCI DSS v4.0 |
| LJK Nonbank | + POJK 4/POJK.05/2021 |
| Fintech & Pembayaran, Ritel | + PCI DSS v4.0 |
| Pemerintahan | + SPBE (Perpres 95/2018, Peraturan BSSN 4/2021) |
| Kesehatan | + Permenkes 24/2022 (Rekam Medis Elektronik) |

Admin bisa menambah atau mengurangi framework di **Pengaturan Organisasi**. Untuk menambah regulasi baru,
tambahkan objek di `server/src/data/frameworks.js`, petakan ke industri, lalu klik **Sinkronkan kontrol**.

## Kontrol bawaan (sesuai prinsip tata kelola)

- **Workflow / state machine** per praktik (`server/src/services/workflows.js`): transisi tidak valid ditolak,
  field wajib diperiksa saat transisi (mis. backout plan sebelum change diajukan, root cause sebelum problem selesai).
  Status hanya bisa diubah lewat endpoint transisi, tidak lewat edit biasa.
- **Segregation of duties**: pemohon atau implementer tidak bisa menyetujui change-nya sendiri, pemohon tidak bisa
  menyetujui request-nya sendiri, dan penulis tidak bisa menerbitkan artikelnya sendiri.
- **CAB**: change berisiko tinggi butuh 2 persetujuan. Emergency change disetujui Change Manager (ECAB).
  Standard change sudah pre-approved.
- **SLA**: due date dihitung dari SLA Policy per prioritas, dijeda saat *pending*, ditandai *breach*,
  dan dihitung ulang kalau prioritas berubah.
- **Audit log append-only**: semua create/update/delete/transisi/approval/login tercatat dan tidak bisa
  diubah atau dihapus lewat model.
- **Keamanan**: JWT, bcrypt (cost 12), akun terkunci 15 menit setelah 5 kali gagal login, rate limit di endpoint auth,
  helmet, filter query anti operator-injection, row-level scope (end user hanya melihat tiketnya sendiri),
  dan work note internal tidak dikirim ke end user.

## Struktur

```
server/   Express + Mongoose API
  src/models/        Skema MongoDB (itsm, assets, governance, projects, user, audit, setting)
  src/resources.js   Registry resource: RBAC, penomoran, workflow, hook bisnis
  src/routes/        Router CRUD generik + auth, users, settings, compliance, dashboard, audit
  src/services/      priority, SLA, workflow, audit
  src/data/frameworks.js  Katalog framework & regulasi per industri
  test/              Unit test + integration test API
client/   React 18 + Vite + React Router
  src/config/modules.js   Definisi field/kolom tiap modul (UI generik)
  src/components/         List, Form, Detail (transisi, CAB, SLA, aktivitas), Layout
  src/pages/              Dashboard, Portal, Kepatuhan, Pengaturan, Pengguna, Audit Log
```

## Menjalankan

Prasyarat: Node.js 20+ dan MongoDB 6+ (lokal atau MongoDB Atlas).

```bash
npm install
cp server/.env.example server/.env      # atur MONGO_URI & JWT_SECRET
npm run seed                            # data demo (SEED_INDUSTRY=banking|government|healthcare|...)
npm run dev                             # API :4000 + React :5173
```

Buka http://localhost:5173 dan login dengan `admin@itsm.local` / `Password123!`.
Akun demo lain (password sama): `servicedesk`, `tech`, `incident`, `change`, `cab`, `asset`, `knowledge`,
`risk`, `ciso`, `architect`, `pm`, `vendor`, `auditor`, `user` (end user) — semuanya `@itsm.local`.
Ganti atau hapus akun demo sebelum dipakai di production.

Mode production (satu container, API sekaligus menyajikan build React):

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d --build
docker compose exec app node server/src/seed.js   # opsional: data demo
```

Tes: `npm test`. Integration test memakai MongoDB di `MONGO_URI_TEST` (default `mongodb://127.0.0.1:27017/itsm_test`)
dan otomatis dilewati kalau MongoDB tidak tersedia.

## Ringkasan API

Semua endpoint di bawah `/api` (kecuali `/api/auth/login` dan `/api/health`) membutuhkan header `Authorization: Bearer <token>`.

| Endpoint | Keterangan |
|---|---|
| `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password` | Autentikasi |
| `GET/POST /:resource`, `GET/PUT/DELETE /:resource/:id` | CRUD. Filter: `?q=`, `?status=a,b`, `?<field>=`, `?page=`, `?sort=` |
| `POST /:resource/:id/transition` `{to, note, ...fields}` | Transisi status sesuai workflow |
| `POST /:resource/:id/comments` `{message, type}` | Komentar / work note |
| `POST /changes/:id/approve` `{decision, comment}` | Keputusan CAB |
| `GET /dashboard`, `GET /compliance/summary`, `POST /compliance/sync` | Dashboard & kepatuhan |
| `GET/PUT /settings`, `GET/POST/PUT /users`, `GET /audit-logs` | Administrasi |

Resource: `incidents, requests, problems, changes, knowledge, services, sla-policies, configuration-items, assets,
vendors, risks, controls, continuity, architecture, projects, sprints, backlog`.

## Belum tersedia (roadmap)

- SLA berbasis jam kerja/kalender libur (saat ini kalender 24×7)
- Notifikasi email/chat dan eskalasi otomatis
- SSO (SAML/OIDC) dan MFA
- Lampiran file/evidence (saat ini berupa link)
- Ekspor laporan (PDF/Excel) dan template laporan regulator
- Multi-tenant (saat ini satu organisasi per deployment)
- Integrasi monitoring/discovery untuk CMDB

## Referensi regulasi

- [PADK OJK 1/2026 — Penyelenggaraan TI oleh Bank Umum (ojk.go.id)](https://ojk.go.id/id/regulasi/Pages/PADK-1-Tahun-2026-Penyelenggaraan-Teknologi-Informasi-oleh-Bank-Umum.aspx)
- [FAQ PADK 1/2026 (ojk.go.id)](https://www.ojk.go.id/id/regulasi/Documents/Pages/PADK-1-Tahun-2026-Penyelenggaraan-Teknologi-Informasi-oleh-Bank-Umum/FAQ%20PADK%201%20Tahun%202026%20Penyelenggaraan%20Teknologi%20Informasi%20oleh%20Bank%20Umum.pdf)
