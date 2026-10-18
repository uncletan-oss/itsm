// Provisioning tenant baru: tenant + admin + konfigurasi awal (SLA, katalog, kontrol kepatuhan)
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const SlaPolicy = require('../models/SlaPolicy');
const { Service } = require('../models/assets');
const { Control } = require('../models/governance');
const { nextNumber } = require('../models/Counter');
const { HttpError } = require('../middleware/error');
const { frameworks, industries } = require('../../../shared/frameworks.mjs');
const { validateSlug, PLANS } = require('../../../shared/plans.mjs');

const DEFAULT_SLA = [[1, 15, 240], [2, 30, 480], [3, 120, 1440], [4, 480, 4320]];
const DEFAULT_CATALOG = [
  { name: 'Reset Password', requestCategory: 'Akun', description: 'Reset password akun domain/email' },
  { name: 'Permintaan Akses Aplikasi', requestCategory: 'Akses', description: 'Hak akses ke aplikasi bisnis', requiresApproval: true },
  { name: 'Permintaan Perangkat Baru', requestCategory: 'Perangkat Keras', description: 'Laptop, monitor, atau perangkat pendukung', requiresApproval: true },
];

/** Membuat/memperbarui kontrol untuk framework yang aktif (idempoten; status asesmen tidak ditimpa). */
async function syncControls(tenantId, frameworkIds) {
  let upserted = 0;
  for (const fw of frameworks.filter((f) => frameworkIds.includes(f.id))) {
    const r = await Control.bulkWrite(
      fw.controls.map((ctl) => ({
        updateOne: {
          filter: { tenant: tenantId, frameworkId: fw.id, code: ctl.code },
          update: {
            $set: { frameworkName: fw.name, title: ctl.title, domain: ctl.domain, nistFunction: ctl.nistFunction, guidance: ctl.guidance },
            $setOnInsert: { status: 'not_assessed', activities: [] },
          },
          upsert: true,
        },
      }))
    );
    upserted += r.upsertedCount;
  }
  return upserted;
}

async function provisionTenant({ slug, name, industry = 'general', plan = 'professional', status = 'trial', admin }) {
  const slugErr = validateSlug(slug);
  if (slugErr) throw new HttpError(400, slugErr);
  if (!PLANS[plan]) throw new HttpError(400, 'Paket tidak dikenal');
  const ind = industries.find((i) => i.id === industry);
  if (!ind) throw new HttpError(400, 'Industri tidak dikenal');
  if (await Tenant.exists({ slug })) throw new HttpError(409, 'Kode workspace sudah dipakai');
  if (!admin?.email || !admin?.name) throw new HttpError(400, 'Nama & email admin wajib diisi');

  const tenant = await Tenant.create({
    slug, name, industry, plan, status, enabledFrameworks: ind.frameworks,
    trialEndsAt: status === 'trial' ? new Date(Date.now() + 14 * 864e5) : undefined,
  });
  try {
    const user = new User({ tenant: tenant._id, name: admin.name, email: admin.email, roles: ['admin'] });
    await user.setPassword(admin.password);
    await user.save();
    for (const [p, r, res] of DEFAULT_SLA) {
      await SlaPolicy.create({ tenant: tenant._id, name: `Incident P${p}`, appliesTo: 'incident', priority: p, responseMinutes: r, resolutionMinutes: res });
      await SlaPolicy.create({ tenant: tenant._id, name: `Request P${p}`, appliesTo: 'request', priority: p, responseMinutes: r * 2, resolutionMinutes: res * 3 });
    }
    for (const svc of DEFAULT_CATALOG) {
      await Service.create({ tenant: tenant._id, number: await nextNumber(tenant._id, 'SVC'), requestable: true, criticality: 'low', createdBy: user._id, ...svc });
    }
    await syncControls(tenant._id, tenant.enabledFrameworks);
    return { tenant, user };
  } catch (err) {
    await Tenant.deleteOne({ _id: tenant._id }); // rollback tenant kosong bila admin gagal dibuat
    await User.deleteMany({ tenant: tenant._id });
    throw err;
  }
}

module.exports = { provisionTenant, syncControls };
