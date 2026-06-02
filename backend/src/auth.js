const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const EXPIRES = '7d';

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken };
