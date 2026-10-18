# Nusa ITSM — Service Management Cloud (SaaS multi-tenant)

Platform SaaS IT Service Management (React + Node.js + MongoDB) yang mengacu pada best practice
**ITIL 4, TOGAF, ITAM (ISO/IEC 19770), NIST CSF 2.0, PMBOK 7, Agile/Scrum**, serta regulasi
Indonesia seperti **PADK OJK No. 1 Tahun 2026** dan **POJK 11/POJK.03/2022** (Penyelenggaraan TI oleh Bank Umum).
Paket regulasi aktif mengikuti **industri** yang dipilih, jadi satu aplikasi bisa dipakai bank, LJK nonbank,
pemerintahan (SPBE), rumah sakit, ritel, manufaktur, dan industri lain.

**🌐 Demo online (GitHub Pages):**
- **Landing page** SaaS (fitur, harga, pendaftaran): https://uncletan-oss.github.io/itsm/
- Pusat bantuan tenant: https://uncletan-oss.github.io/itsm/#/w/bank-nusantara
- Portal (login): https://uncletan-oss.github.io/itsm/portal/ — pilih workspace contoh lalu klik tombol peran.

Workspace demo (password semua akun `Password123!`):

| Workspace | Organisasi | Industri | Paket |
|---|---|---|---|
| `bank-nusantara` | PT Bank Nusantara Sejahtera | Perbankan (POJK 11/2022 + PADK 1/2026) | Enterprise |
| `rs-sehat-sentosa` | RS Sehat Sentosa | Kesehatan (Permenkes 24/2022) | Professional |
| `pemkot-harmoni` | Pemerintah Kota Harmoni | Pemerintahan (SPBE) | Starter |
| *(kosong)* | Operator platform — `platform@itsm.local` | Konsol SaaS | — |

## Konsep SaaS multi-tenant

- **Tenant = workspace organisasi.** Semua data (tiket, aset, kontrol, SLA, notifikasi, audit log, penomoran)
  memiliki field `tenant`; setiap query server dibatasi tenant dari JWT, dan referensi ke record tenant lain
  ditolak (`400`). Nomor tiket dimulai dari `INC000001` di setiap tenant.
- **Login** memakai *kode workspace* + email + password. Email unik per tenant (orang yang sama bisa punya akun di beberapa tenant).
- **Pendaftaran mandiri** (`/daftar`) membuat tenant trial 14 hari + admin + SLA P1–P4 + katalog dasar + kontrol kepatuhan sesuai industri.
- **Paket langganan** (`shared/plans.mjs`) membatasi modul dan jumlah pengguna aktif:
  Starter (ITSM inti, 15 pengguna) · Professional (+ GRC, 100 pengguna) · Enterprise (+ arsitektur & proyek, tanpa batas).
  Modul di luar paket tampil terkunci untuk admin dan ditolak `403` oleh server.
- **Operator platform** (peran `platform_admin`, tanpa tenant; login dengan workspace kosong) mengelola tenant di konsol
  tersendiri — tanpa akses ke data operasional tenant:
  - **paket & status** (trial/aktif/ditangguhkan; tenant yang ditangguhkan tidak bisa login),
  - **grant modul per tenant**: tombol *Modul* di daftar tenant → pilih modul per domain (ITSM, GRC & Assurance,
    BCM & DR, DCIM, Keuangan TI, Arsitektur & Perencanaan) atau ikuti default paket,
  - **kuota pengguna aktif** per tenant (override batas paket).
- **Pusat bantuan publik per tenant** di `/w/<workspace>`: status layanan, knowledge base publik, katalog, dan framework.

## Workflow end-to-end per domain

Semua modul memakai state machine + **mesin persetujuan multi-tahap** (`shared/approvals.mjs`) dengan ambang nilai,
penyetuju yang ditunjuk (mis. pemilik risiko/pemilik proses), maker-checker, dan putaran ulang setelah ditolak.
Aturan lintas-record (`shared/effects.mjs`) dijalankan identik di server & demo.

| Domain | Alur | Persetujuan & kontrol otomatis |
|---|---|---|
| Incident | baru → ditugaskan → dikerjakan ⇄ pending (SLA dijeda) → selesai → ditutup/dibuka kembali | prioritas impact×urgency, SLA, flag regulator; *buat problem / artikel* |
| Problem | baru → investigasi → known error → selesai → ditutup | RCA wajib; *ajukan change*, *terbitkan known error* |
| Change | draft → diajukan → assessment → CAB → disetujui → terjadwal → implementasi → PIR → ditutup | CAB 1–2 persetujuan (risiko tinggi = 2), SoD; *ajukan akses DC* |
| Service request | diajukan → menunggu persetujuan → disetujui → diproses → terpenuhi → ditutup | approver yang ditunjuk |
| Vendor | prospek → due diligence → persetujuan → aktif → review → diputus | Procurement → Risk → CISO (kritikal) → Eksekutif (data offshore); exit strategy & persetujuan offshore wajib |
| Kontrak | draft → review legal → persetujuan → aktif → review perpanjangan → berakhir/diputus | Vendor Mgr → Risk → Eksekutif (≥ Rp 1 M / alih daya material) |
| Anggaran | draft → persetujuan → aktif → ditutup | IT Controller → CIO; komitmen & realisasi terhitung otomatis |
| PO | draft → persetujuan → disetujui → dipesan → diterima (BAST) → ditutup | Procurement → Controller → CIO (≥ Rp 500 jt); **kontrol ketersediaan anggaran** |
| Tagihan | diterima → terverifikasi (**3-way match**) → persetujuan → disetujui → lunas | AP → Controller (≥ Rp 100 jt); **jurnal otomatis** (beban/aset + PPN masukan / utang usaha) |
| Pembayaran | draft → persetujuan → disetujui → dieksekusi (treasury) → direkonsiliasi | **maker-checker**; tidak boleh melebihi sisa tagihan; jurnal & status lunas otomatis |
| Jurnal | draft → persetujuan → diposting → dibalik | debit = kredit; jurnal balik otomatis |
| Aset (ITAM) | diminta → dipesan → stok → terpasang ⇄ perbaikan → retired → persetujuan disposal → dimusnahkan | Asset Mgr → CISO (sanitasi data, sertifikat pemusnahan) |
| CMDB | planned → in build → aktif ⇄ maintenance → retired | relasi rak (DCIM) |
| Risiko | teridentifikasi → dinilai → penanganan → monitoring → ditutup; *risk acceptance* | pemilik risiko → Risk Officer → Eksekutif (tinggi/kritis); *tambah mitigasi* |
| Mitigasi | terbuka → dikerjakan → selesai (bukti) → terverifikasi | verifikasi independen (≠ pemilik) |
| Pengujian kontrol | direncanakan → pengujian → review → disimpulkan | reviewer ≠ penguji; status kontrol diperbarui & **temuan otomatis** bila tidak efektif |
| Temuan audit | terbuka → rencana tindak lanjut → remediasi → validasi → ditutup | validasi auditor (≠ pemilik), eksekutif untuk temuan kritis |
| BIA | draft → review → pengesahan → disetujui → perlu update | pemilik proses → BCM |
| BCP/DRP | draft → review → pengesahan → disetujui → teruji / perlu update | BCM → Eksekutif |
| Uji DR | direncanakan → persetujuan → disetujui → dilaksanakan → dilaporkan → ditutup | BCM → Eksekutif (failover penuh); rencana diperbarui & **temuan otomatis** bila RTO/RPO terlampaui |
| Data center & rak | planned → commissioning → operasional ⇄ maintenance → dinonaktifkan | utilisasi ruang & daya terhitung dari rak |
| Akses fisik DC | diajukan → persetujuan → disetujui → check-in (verifikasi ID) → check-out | DC Mgr → CISO (pihak luar) |
| Inisiatif / RPTI | diusulkan → assessment → persetujuan → disetujui → dieksekusi → selesai | Arsitek → Finance (≥ Rp 1 M) → IT Steering Committee; skor prioritas otomatis; *buat proyek* |
| Arsitektur | draft → review → ARB → disetujui → deprecated | ARB → CIO (target state/investasi) |

## Dashboard KPI

Menu **Dashboard KPI** (eksekutif & manajer) menampilkan tren bulanan (3/6/12 bulan) dengan sparkline & delta:
MTTR, kepatuhan SLA, keberhasilan change, belanja TI, anggaran vs komitmen vs realisasi, aging utang usaha,
heatmap risiko inheren & residual 5×5, efektivitas kontrol, temuan & mitigasi terlambat, utilisasi daya/ruang DC,
hasil uji DR (RTO aktual vs target), dan cakupan BIA layanan kritikal. Data mengikuti hak baca masing-masing peran.

## Menu sesuai peran (RBAC)

Matriks hak akses default ada di `shared/permissions.mjs` (least privilege, 22 peran — termasuk IT Controller, Akuntan, Treasury, DC Manager, BCM Coordinator, dan CIO/Direksi). Admin tenant dapat menyesuaikan
siapa yang boleh **melihat (R)** dan **mengubah (W)** setiap modul di menu **Peran & Akses**; server menegakkan matriks
efektif (default ⊕ override tenant ⊖ paket), dan sidebar portal dibangun dari matriks yang sama — sehingga teknisi,
auditor, risk officer, atau end user masing-masing hanya melihat menu yang relevan. Aturan alur kerja (mis. SoD di CAB)
tetap berlaku apa pun pengaturannya.

## Dua frontend

| Frontend | URL | Untuk | Isi |
|---|---|---|---|
| **Publik** | `/` dan `/w/<workspace>` | Siapa saja, tanpa login | Landing SaaS, harga, pendaftaran, katalog regulasi; pusat bantuan & status layanan per tenant |
| **Portal** | `/portal/` | Pengguna workspace & operator platform | Dashboard, Pekerjaan Saya, modul ITSM/GRC/arsitektur sesuai peran, laporan, administrasi |

Keduanya dibangun dari satu proyek Vite (multi-page: `client/index.html` dan `client/portal/index.html`) dengan
design system "Sapphire & Champagne" (navy + champagne gold, Plus Jakarta Sans, mode gelap).

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
| Produktivitas | Pekerjaan Saya (ditugaskan, antrean persetujuan CAB/request/artikel, tiket yang diajukan), notifikasi in-app, pencarian global (Ctrl K), record terkait, ekspor CSV | ITIL 4 |
| Analitik | Laporan: tren incident, MTTR & SLA per prioritas, keberhasilan change, top layanan, umur backlog | ITIL 4 SLM & Continual Improvement |
| Administrasi | Pengguna (batas per paket), Peran & Akses (matriks per tenant), Audit Log append-only, Pengaturan workspace | ISO 27001 A.8.15, NIST PR.AA |

### Paket regulasi per industri

| Industri | Framework yang diaktifkan otomatis |
|---|---|
| Semua industri (dasar) | ITIL 4, ISO/IEC 20000-1, ISO/IEC 27001:2022, NIST CSF 2.0, ITAM, TOGAF, PMBOK 7, Scrum, UU 27/2022 (PDP), PP 71/2019 (PSTE) |
| Perbankan (Bank Umum) | + POJK 11/POJK.03/2022, **PADK OJK 1/2026**, PCI DSS v4.0 |
| LJK Nonbank | + POJK 4/POJK.05/2021 |
| Fintech & Pembayaran, Ritel | + PCI DSS v4.0 |
| Pemerintahan | + SPBE (Perpres 95/2018, Peraturan BSSN 4/2021) |
| Kesehatan | + Permenkes 24/2022 (Rekam Medis Elektronik) |

Admin tenant bisa menambah atau mengurangi framework di **Pengaturan Workspace**. Untuk menambah regulasi baru,
tambahkan objek di `shared/frameworks.mjs`, petakan ke industri, lalu klik **Sinkronkan kontrol**.

## Kontrol bawaan (sesuai prinsip tata kelola)

- **Workflow / state machine** per praktik (`shared/workflows.mjs`): transisi tidak valid ditolak,
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
shared/   Logika bisnis murni — dipakai server & backend demo
  modules.mjs      Definisi deklaratif modul (field, workflow, hitungan) → model MongoDB, registry & UI
  approvals.mjs    Mesin persetujuan multi-tahap
  effects.mjs      Aturan lintas-record (kontrol anggaran, 3-way match, jurnal, temuan otomatis, utilisasi DC) & aksi "buat terkait"
  kpi.mjs          Perhitungan Dashboard KPI
  seed-extra.mjs   Data contoh modul lanjutan (dipakai seed server & demo)
  permissions.mjs  Matriks hak akses + override tenant + grant modul
  plans.mjs        Paket langganan SaaS & validasi kode workspace
  workflows.mjs, sla.mjs, priority.mjs, notify.mjs, insights.mjs (dashboard/laporan/Pekerjaan Saya)
  frameworks.mjs   Katalog framework & regulasi per industri
server/   Express + Mongoose API
  src/models/        Tenant, User, Notification, AuditLog + skema modul (semua ber-tenant)
  src/resources.js   Registry resource: penomoran, workflow, hook bisnis
  src/routes/        CRUD generik (scoped tenant) + auth, tenant, users, platform, public, insights, compliance, audit
  src/services/      provision (onboarding tenant), notify, audit
  test/              Unit test + integration test (termasuk isolasi tenant)
client/   React 18 + Vite + React Router
  index.html, src/public/ Frontend publik (landing SaaS, pendaftaran, pusat bantuan tenant)
  portal/index.html       Entry frontend portal (src/main.jsx)
  src/components/         Layout (menu per peran), List, Form, Detail (stepper, CAB, SLA, aktivitas, terkait), ui, charts, Icon
  src/pages/              Dashboard, Pekerjaan Saya, Laporan, Portal, Kepatuhan, Pengaturan, Peran & Akses, Pengguna, Audit Log, Platform
  src/demo/               Backend tiruan multi-tenant di browser untuk mode demo / GitHub Pages
```

## Menjalankan

Prasyarat: Node.js 22.12+ dan MongoDB 6+ (lokal atau MongoDB Atlas).

```bash
npm install
cp server/.env.example server/.env      # atur MONGO_URI & JWT_SECRET
npm run seed                            # 3 tenant demo + operator platform (SEED_RESET=true untuk mengulang)
npm run dev                             # API :4000 + React :5173
```

Buka http://localhost:5173 (situs publik) atau http://localhost:5173/portal/ dan login dengan workspace
`bank-nusantara`, email `admin@itsm.local`, password `Password123!`. Akun demo lain (password sama): `servicedesk`, `tech`, `incident`, `change`, `cab`, `asset`, `knowledge`,
`risk`, `ciso`, `architect`, `pm`, `vendor`, `auditor`, `user` (end user) — semuanya `@itsm.local`.
Ganti atau hapus akun demo sebelum dipakai di production.

Mode production (satu container, API sekaligus menyajikan build React):

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d --build
docker compose exec app node server/src/seed.js   # opsional: data demo
```

### Mode demo (GitHub Pages, tanpa server)

GitHub Pages hanya menyajikan file statis, jadi build demo (`npm run build:demo -w client`) memakai backend tiruan
yang berjalan di browser (`client/src/demo/`). Backend ini meniru kontrak REST API dan memakai logika bisnis yang sama
dari `shared/` (workflow, SLA, prioritas, katalog regulasi). Data tersimpan di localStorage masing-masing pengunjung
dan bisa dikembalikan ke awal dengan tombol **Reset data demo**. Mode demo tidak punya keamanan sungguhan
(password dicek di browser), jadi jangan dipakai untuk data asli.

Deploy dilakukan otomatis oleh `.github/workflows/pages.yml` setiap ada push. Kalau Pages belum aktif, buka
**Settings → Pages → Build and deployment → Source: GitHub Actions**, lalu jalankan ulang workflow-nya.
Coba lokal: `npm run dev:demo -w client`.

Tes: `npm test`. Integration test memakai MongoDB di `MONGO_URI_TEST` (default `mongodb://127.0.0.1:27017/itsm_test`)
dan otomatis dilewati kalau MongoDB tidak tersedia.

## Ringkasan API

Semua endpoint di bawah `/api` (kecuali `/api/public/*`, `/api/auth/login` dan `/api/health`) membutuhkan header `Authorization: Bearer <token>`.

| Endpoint | Keterangan |
|---|---|
| `POST /public/signup` | Pendaftaran workspace (tanpa login) |
| `GET /public/t/:workspace/{info,status,knowledge[/:id],catalog}` | Pusat bantuan publik per tenant |
| `POST /auth/login {workspace,email,password}`, `GET /auth/me` (user + tenant + matriks akses), `POST /auth/change-password` | Autentikasi |
| `GET/POST /:resource`, `GET/PUT/DELETE /:resource/:id` | CRUD. Filter: `?q=`, `?status=a,b`, `?<field>=`, `?page=`, `?sort=` |
| `POST /:resource/:id/transition` `{to, note, ...fields}` | Transisi status sesuai workflow |
| `POST /:resource/:id/comments` `{message, type}` | Komentar / work note |
| `POST /changes/:id/approve` `{decision, comment}` | Keputusan CAB |
| `GET /:resource/:id/related` | Record lain yang mereferensikan record ini |
| `POST /:resource/:id/approve {decision, comment}` | Keputusan tahap persetujuan saat ini |
| `GET /:resource/:id/spawn/:target` · `POST /:target {..., _spawnFrom}` | Aksi "buat record terkait" (prefill + tautan balik) |
| `GET /kpi?months=` | Dashboard KPI lintas domain |
| `GET /dashboard`, `/reports?days=`, `/my-work`, `/search?q=` | Dashboard, laporan, Pekerjaan Saya, pencarian global |
| `GET /notifications`, `POST /notifications/:id/read`, `/notifications/read-all` | Notifikasi in-app |
| `GET /compliance/summary`, `POST /compliance/sync` | Kepatuhan |
| `GET/PUT /tenant`, `GET/PUT /tenant/access`, `GET/POST/PUT /users`, `GET /audit-logs` | Administrasi workspace |
| `GET/POST /platform/tenants`, `PUT /platform/tenants/:id {plan, status, modules, maxUsers}` | Konsol operator platform (grant modul & kuota) |

Resource: `incidents, requests, problems, changes, knowledge, services, sla-policies, configuration-items, assets,
vendors, contracts, budgets, purchase-orders, invoices, payments, journals, risks, risk-actions, controls, control-tests,
findings, bia, continuity, dr-tests, datacenters, racks, dc-access, initiatives, architecture, projects, sprints, backlog`.

## Belum tersedia (roadmap)

- SLA berbasis jam kerja/kalender libur (saat ini kalender 24×7)
- Notifikasi email/chat dan eskalasi otomatis (notifikasi in-app sudah ada)
- Penagihan (billing) otomatis & self-service upgrade paket
- Integrasi ERP/core accounting & bank (H2H) untuk eksekusi pembayaran; COA & tarif PPN perlu disesuaikan (`shared/finance.mjs`)
- Integrasi sensor DCIM (daya/suhu real-time); saat ini utilisasi diisi manual per rak
- SSO (SAML/OIDC) dan MFA
- Lampiran file/evidence (saat ini berupa link)
- Ekspor laporan PDF dan template laporan regulator (ekspor CSV per modul sudah ada)
- Dashboard & laporan memakai agregasi in-memory per tenant — perlu pipeline agregasi/pre-compute untuk tenant sangat besar
- Database terpisah per tenant (saat ini shared database dengan isolasi per field `tenant`)
- Integrasi monitoring/discovery untuk CMDB

## Referensi regulasi

- [PADK OJK 1/2026 — Penyelenggaraan TI oleh Bank Umum (ojk.go.id)](https://ojk.go.id/id/regulasi/Pages/PADK-1-Tahun-2026-Penyelenggaraan-Teknologi-Informasi-oleh-Bank-Umum.aspx)
- [FAQ PADK 1/2026 (ojk.go.id)](https://www.ojk.go.id/id/regulasi/Documents/Pages/PADK-1-Tahun-2026-Penyelenggaraan-Teknologi-Informasi-oleh-Bank-Umum/FAQ%20PADK%201%20Tahun%202026%20Penyelenggaraan%20Teknologi%20Informasi%20oleh%20Bank%20Umum.pdf)
