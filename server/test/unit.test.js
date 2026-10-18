const test = require('node:test');
const assert = require('node:assert');
const { calculatePriority, riskScore } = require('../src/services/priority');
const { computeDueDates, applyTransition, slaStatus } = require('../src/services/sla');
const { workflows, checkTransition } = require('../src/services/workflows');

test('matriks prioritas impact x urgency', () => {
  assert.strictEqual(calculatePriority(1, 1), 1);
  assert.strictEqual(calculatePriority(1, 2), 2);
  assert.strictEqual(calculatePriority(2, 2), 3);
  assert.strictEqual(calculatePriority(3, 3), 4);
  assert.throws(() => calculatePriority(0, 1));
});

test('skor risiko 5x5', () => {
  assert.deepStrictEqual(riskScore(1, 4), { score: 4, level: 'low' });
  assert.deepStrictEqual(riskScore(3, 3), { score: 9, level: 'medium' });
  assert.deepStrictEqual(riskScore(3, 4), { score: 12, level: 'high' });
  assert.deepStrictEqual(riskScore(5, 4), { score: 20, level: 'critical' });
});

test('SLA: respons, pause/resume memperpanjang due date, resolve', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const sla = computeDueDates(t0, { _id: 'p', responseMinutes: 15, resolutionMinutes: 240 });
  applyTransition(sla, 'new', 'in_progress', new Date('2026-01-01T00:10:00Z'));
  assert.strictEqual(sla.responseBreached, false);
  applyTransition(sla, 'in_progress', 'pending', new Date('2026-01-01T01:00:00Z'));
  assert.strictEqual(slaStatus(sla, new Date('2026-01-01T01:30:00Z')), 'paused');
  applyTransition(sla, 'pending', 'in_progress', new Date('2026-01-01T02:00:00Z'));
  assert.strictEqual(sla.pausedMinutes, 60);
  assert.strictEqual(sla.resolutionDue.toISOString(), '2026-01-01T05:00:00.000Z');
  applyTransition(sla, 'in_progress', 'resolved', new Date('2026-01-01T04:30:00Z'));
  assert.strictEqual(sla.resolutionBreached, false);
  assert.strictEqual(slaStatus(sla), 'met');
});

test('SLA: respons terlambat ditandai breach', () => {
  const sla = computeDueDates(new Date('2026-01-01T00:00:00Z'), { _id: 'p', responseMinutes: 15, resolutionMinutes: 60 });
  applyTransition(sla, 'new', 'assigned', new Date('2026-01-01T00:20:00Z'));
  assert.strictEqual(sla.responseBreached, true);
  assert.strictEqual(slaStatus(sla, new Date('2026-01-01T02:00:00Z')), 'breached');
});

const user = (id, roles) => ({ _id: id, roles });

test('workflow incident: resolve wajib kode & catatan resolusi', () => {
  const doc = { status: 'in_progress', assignee: 'u1' };
  assert.match(checkTransition(workflows.incident, doc, 'resolved', user('u1', ['technician'])), /Kode resolusi/);
  Object.assign(doc, { resolutionCode: 'solved_permanent', resolutionNotes: 'ok' });
  assert.strictEqual(checkTransition(workflows.incident, doc, 'resolved', user('u1', ['technician'])), null);
  assert.match(checkTransition(workflows.incident, { status: 'new' }, 'closed', user('u1', ['admin'])), /tidak diizinkan/);
});

test('workflow change: normal change harus lewat CAB, emergency dengan SoD', () => {
  const cm = user('cm', ['change_manager']);
  assert.match(checkTransition(workflows.change, { status: 'assessment', type: 'normal' }, 'approved', cm), /CAB/);
  assert.strictEqual(checkTransition(workflows.change, { status: 'assessment', type: 'standard' }, 'approved', cm), null);
  assert.match(checkTransition(workflows.change, { status: 'assessment', type: 'emergency', requester: 'cm' }, 'approved', cm), /Segregation/);
  assert.match(checkTransition(workflows.change, { status: 'draft' }, 'submitted', cm), /backout/);
});

test('workflow knowledge: penulis tidak boleh mempublikasikan artikelnya sendiri', () => {
  const km = user('km', ['knowledge_manager']);
  assert.match(checkTransition(workflows.knowledge, { status: 'review', author: 'km' }, 'published', km), /Segregation/);
  assert.strictEqual(checkTransition(workflows.knowledge, { status: 'review', author: 'x' }, 'published', km), null);
});
