import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOverdueDays, calculateFine, validateBookInput, validateRegistration } from '../src/domain.js';

test('overdue days are zero before due date and count calendar days after it', () => {
  assert.equal(calculateOverdueDays('2026-11-20', '2026-11-19'), 0);
  assert.equal(calculateOverdueDays('2026-11-20', '2026-11-23'), 3);
});

test('fine is the configured daily rate times overdue days', () => {
  assert.equal(calculateFine(3, 5), 15);
  assert.equal(calculateFine(0, 5), 0);
});

test('book validation rejects invalid ISBNs and copy counts', () => {
  const base = { title: 'A book', author: 'An author', isbn: '978-0132350884', category: 'Tech', shelfLocation: 'A-1', totalCopies: 2 };
  assert.equal(validateBookInput(base).length, 0);
  assert.ok(validateBookInput({ ...base, isbn: 'bad' }).some(message => message.includes('ISBN')));
  assert.ok(validateBookInput({ ...base, totalCopies: 0 }).some(message => message.includes('copies')));
});

test('registration validates required identity, email, and matching password', () => {
  assert.equal(validateRegistration({ fullName: 'Ada Reader', email: 'ada@example.com', password: 'secret1', confirmPassword: 'secret1' }).length, 0);
  assert.ok(validateRegistration({ fullName: '', email: 'bad', password: '123', confirmPassword: 'x' }).length >= 3);
});
