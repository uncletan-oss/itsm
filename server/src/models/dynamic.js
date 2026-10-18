// Model Mongoose yang dibangun otomatis dari definisi deklaratif modul (shared/modules.mjs)
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { basePlugin } = require('./common');
const { MODULE_DEFS, MODEL_NAMES } = require('../../../shared/modules.mjs');

function pathFor(f) {
  const t = f.type === 'readonly' ? f.store : f.type;
  const base = (() => {
    switch (t) {
      case 'number': return { type: Number };
      case 'date': case 'datetime': return { type: Date };
      case 'bool': return { type: Boolean };
      case 'user': return { type: Schema.Types.ObjectId, ref: 'User' };
      case 'ref': return { type: Schema.Types.ObjectId, ref: MODEL_NAMES[f.resource] };
      case 'refs': return [{ type: Schema.Types.ObjectId, ref: MODEL_NAMES[f.resource] }];
      case 'tags': return [String];
      case 'lines': return [new Schema(Object.fromEntries(f.lines.map((l) => [l.key, l.type === 'number' ? Number : String])), { _id: false })];
      case 'select':
        return f.number ? { type: Number } : { type: String, enum: [...new Set(['', ...f.options.map(([v]) => v)])] };
      default: return { type: String, trim: true };
    }
  })();
  if (Array.isArray(base)) return base;
  if (f.required && f.type !== 'readonly') base.required = [true, `${f.label} wajib diisi`];
  if (f.default !== undefined) base.default = f.default;
  return base;
}

const models = {};
for (const [key, def] of Object.entries(MODULE_DEFS)) {
  const shape = Object.fromEntries(def.fields.map((f) => [f.key, pathFor(f)]));
  const statuses = def.workflow
    ? [...new Set([...Object.keys(def.workflow.transitions), ...Object.values(def.workflow.transitions).flat()])]
    : def.fields.find((f) => f.key === 'status')?.options.map(([v]) => v);
  if (!shape.status && statuses) shape.status = { type: String, enum: statuses, default: def.initial || statuses[0] };
  const schema = new Schema(shape);
  schema.plugin(basePlugin);
  models[key] = mongoose.models[def.model] || mongoose.model(def.model, schema);
  models[key].readonlyKeys = def.fields.filter((f) => f.type === 'readonly').map((f) => f.key);
}

module.exports = models;
