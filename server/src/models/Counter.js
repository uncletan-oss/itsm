const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('Counter', counterSchema);

async function nextNumber(prefix) {
  const c = await Counter.findByIdAndUpdate(prefix, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${prefix}${String(c.seq).padStart(6, '0')}`;
}

module.exports = { Counter, nextNumber };
