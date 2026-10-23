const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLE_KEYS, PLATFORM_ROLE } = require('../constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // null = operator platform SaaS (tidak terikat tenant)
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    roles: { type: [{ type: String, enum: [...ROLE_KEYS, PLATFORM_ROLE] }], default: ['requester'] },
    department: String,
    title: String,
    phone: String,
    active: { type: Boolean, default: true },
    // Akun portal penyedia (peran "supplier") terikat ke satu vendor
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    lastLoginAt: Date,
    failedLogins: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.index({ tenant: 1, email: 1 }, { unique: true });

userSchema.methods.setPassword = async function setPassword(pw) {
  if (!pw || pw.length < 8) throw Object.assign(new Error('Password minimal 8 karakter'), { status: 400 });
  this.passwordHash = await bcrypt.hash(pw, 12);
};
userSchema.methods.checkPassword = function checkPassword(pw) {
  return bcrypt.compare(pw, this.passwordHash);
};
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.failedLogins;
    delete ret.lockedUntil;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
