const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('Counter', counterSchema);

/** Penomoran per tenant, mis. INC000001 dimulai dari 1 di setiap tenant. */
async function nextNumber(tenantId, prefix) {
  const c = await Counter.findByIdAndUpdate(`${tenantId}:${prefix}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${prefix}${String(c.seq).padStart(6, '0')}`;
}

module.exports = { Counter, nextNumber };
