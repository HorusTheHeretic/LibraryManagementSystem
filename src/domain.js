import crypto from 'node:crypto';

export function calculateOverdueDays(dueDate, asOfDate) {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const asOf = Date.parse(`${asOfDate}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(asOf)) throw new TypeError('Dates must be YYYY-MM-DD.');
  return Math.max(0, Math.floor((asOf - due) / 86_400_000));
}

export function calculateFine(days, dailyRate) {
  return Math.round(Math.max(0, Number(days)) * Math.max(0, Number(dailyRate)) * 100) / 100;
}

export function validateBookInput(book) {
  const errors = [];
  const required = [['title', 200], ['author', 150], ['isbn', 17], ['category', 80], ['shelfLocation', 50]];
  for (const [field, max] of required) {
    const value = String(book?.[field] ?? '').trim();
    if (!value) errors.push(`${field} is required.`);
    else if (value.length > max) errors.push(`${field} must be at most ${max} characters.`);
  }
  const isbn = String(book?.isbn ?? '').trim();
  if (isbn && !/^(?=(?:\D*\d){10}(?:(?:\D*\d){3})?\D*$)[\d-]+$/.test(isbn)) {
    errors.push('ISBN must contain 10 or 13 digits (hyphens allowed).');
  }
  const copies = Number(book?.totalCopies);
  if (!Number.isInteger(copies) || copies < 1 || copies > 1000) errors.push('Total copies must be between 1 and 1000.');
  return errors;
}

export function validateRegistration({ fullName, email, password, confirmPassword } = {}) {
  const errors = [];
  const name = String(fullName ?? '').trim();
  const normalizedEmail = String(email ?? '').trim();
  if (!name || name.length > 100) errors.push('Full name is required and must be at most 100 characters.');
  if (normalizedEmail.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) errors.push('Enter a valid email address (up to 150 characters).');
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) errors.push('Password must be between 6 and 100 characters.');
  if (password !== confirmPassword) errors.push('Passwords do not match.');
  return errors;
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

// Compatible with the prior ASP.NET PBKDF2 format: Base64(salt).Base64(hash).
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
  return `${salt.toString('base64')}.${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [saltText, hashText, extra] = String(stored).split('.');
    if (!saltText || !hashText || extra !== undefined) return false;
    const salt = Buffer.from(saltText, 'base64');
    const expected = Buffer.from(hashText, 'base64');
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
