/**
 * Matriks prioritas ITIL: Impact (1=Tinggi..3=Rendah) x Urgency (1=Tinggi..3=Rendah)
 *            U1  U2  U3
 *   I1       P1  P2  P3
 *   I2       P2  P3  P4
 *   I3       P3  P4  P4
 */
function calculatePriority(impact = 3, urgency = 3) {
  const i = Number(impact);
  const u = Number(urgency);
  if (![1, 2, 3].includes(i) || ![1, 2, 3].includes(u)) throw new Error('Impact/urgency harus 1..3');
  return Math.min(i + u - 1, 4);
}

/** Skor risiko 5x5 (likelihood x impact) — selaras ISO 31000 / NIST SP 800-30. */
function riskScore(likelihood, impact) {
  if (!likelihood || !impact) return { score: undefined, level: undefined };
  const score = Number(likelihood) * Number(impact);
  let level = 'low';
  if (score >= 20) level = 'critical';
  else if (score >= 10) level = 'high';
  else if (score >= 5) level = 'medium';
  return { score, level };
}

module.exports = { calculatePriority, riskScore };
