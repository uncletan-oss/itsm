const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLE_KEYS } = require('../constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    roles: { type: [{ type: String, enum: ROLE_KEYS }], default: ['requester'] },
    department: String,
    title: String,
    phone: String,
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
    failedLogins: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
  },
  { timestamps: true }
);

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
