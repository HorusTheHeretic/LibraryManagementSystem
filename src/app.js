import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateFine, hashPassword, normalizeEmail, validateBookInput,
  validateRegistration, verifyPassword,
} from './domain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BOOK_FIELDS = `id, title, author, isbn, category, shelf_location AS shelfLocation,
  total_copies AS totalCopies, available_copies AS availableCopies`;
const LOAN_FIELDS = `l.id, l.book_id AS bookId, l.user_id AS userId, l.issued_on AS issuedOn,
  l.due_on AS dueOn, l.returned_on AS returnedOn, l.fine_amount AS fineAmount,
  l.fine_paid AS finePaid, b.title AS bookTitle, b.isbn, u.full_name AS memberName,
  u.email AS memberEmail, GREATEST(0, DATEDIFF(IF(l.returned_on IS NULL, CURDATE(), DATE(l.returned_on)), l.due_on)) AS overdueDays`;

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signSession(user, secret) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id, fullName: user.fullName, role: user.role, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
  })).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

function readSession(token, secret) {
  if (!token) return null;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    if (!safeEqual(signature, expected)) return null;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!Number.isInteger(session.id) || !session.role || session.exp <= Date.now() / 1000) return null;
    return session;
  } catch { return null; }
}

function cookieValue(req, name) {
  const prefix = `${name}=`;
  const item = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}

function makeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendValidation(res, errors) {
  if (errors.length) res.status(400).json({ error: errors[0], errors });
  return errors.length > 0;
}

function validRole(role) { return ['Student', 'Staff', 'Admin'].includes(role); }

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvDocument(headers, rows) {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function createApp({ pool, sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), finePerDay = 5 }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
      const origin = new URL(req.headers.origin).origin;
      if (origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: 'Cross-origin request denied.' });
    }
    req.session = readSession(cookieValue(req, 'lms_session'), sessionSecret);
    next();
  });
  app.use(express.static(path.resolve(here, '../public')));

  const auth = (req, _res, next) => req.session ? next() : next(makeError(401, 'Sign in is required.'));
  const roles = (...allowed) => (req, _res, next) => {
    if (!req.session) return next(makeError(401, 'Sign in is required.'));
    if (!allowed.includes(req.session.role)) return next(makeError(403, 'You do not have permission to do that.'));
    next();
  };
  const setSessionCookie = (res, token) => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `lms_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`);
  };
  const clearSessionCookie = res => res.setHeader('Set-Cookie', 'lms_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = req.body?.password;
      if (!email || typeof password !== 'string') return res.status(400).json({ error: 'Email and password are required.' });
      const [users] = await pool.execute('SELECT id, full_name AS fullName, email, role, password_hash AS passwordHash FROM users WHERE email=? LIMIT 1', [email]);
      const user = users[0];
      if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid email or password.' });
      setSessionCookie(res, signSession(user, sessionSecret));
      res.json({ user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } });
    } catch (error) { next(error); }
  });
  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const data = req.body || {};
      const errors = validateRegistration(data);
      if (sendValidation(res, errors)) return;
      const email = normalizeEmail(data.email);
      const [result] = await pool.execute('INSERT INTO users (full_name,email,password_hash,role) VALUES (?,?,?,?)', [data.fullName.trim(), email, hashPassword(data.password), 'Student']).catch(error => {
        if (error.code === 'ER_DUP_ENTRY') throw makeError(409, 'This email is already registered.');
        throw error;
      });
      const user = { id: result.insertId, fullName: data.fullName.trim(), role: 'Student' };
      setSessionCookie(res, signSession(user, sessionSecret));
      res.status(201).json({ user: { id: user.id, fullName: user.fullName, email, role: user.role } });
    } catch (error) { next(error); }
  });
  app.post('/api/auth/logout', (_req, res) => { clearSessionCookie(res); res.status(204).end(); });
  app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.session }));

  app.get('/api/books', auth, async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      const category = String(req.query.category || '').trim();
      const where = [];
      const values = [];
      if (q) { where.push('(title LIKE ? OR author LIKE ? OR isbn LIKE ?)'); values.push(`%${q}%`, `%${q}%`, `%${q}%`); }
      if (category) { where.push('category=?'); values.push(category); }
      const [books] = await pool.execute(`SELECT ${BOOK_FIELDS} FROM books ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY title`, values);
      const [categories] = await pool.query('SELECT DISTINCT category FROM books ORDER BY category');
      res.json({ books, categories: categories.map(x => x.category) });
    } catch (error) { next(error); }
  });
  app.post('/api/books', roles('Admin'), async (req, res, next) => {
    try {
      const data = req.body || {};
      const errors = validateBookInput(data);
      if (sendValidation(res, errors)) return;
      const values = [data.title.trim(), data.author.trim(), data.isbn.trim(), data.category.trim(), data.shelfLocation.trim(), Number(data.totalCopies)];
      const [result] = await pool.execute('INSERT INTO books (title,author,isbn,category,shelf_location,total_copies,available_copies) VALUES (?,?,?,?,?,?,?)', [...values, values[5]]).catch(error => {
        if (error.code === 'ER_DUP_ENTRY') throw makeError(409, 'A book with this ISBN is already registered.');
        throw error;
      });
      const [[book]] = await pool.execute(`SELECT ${BOOK_FIELDS} FROM books WHERE id=?`, [result.insertId]);
      res.status(201).json({ book });
    } catch (error) { next(error); }
  });
  app.put('/api/books/:id', roles('Admin'), async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return next(makeError(400, 'Invalid book id.'));
    const conn = await pool.getConnection();
    try {
      const data = req.body || {};
      const errors = validateBookInput(data);
      if (sendValidation(res, errors)) return;
      await conn.beginTransaction();
      const [[book]] = await conn.execute('SELECT * FROM books WHERE id=? FOR UPDATE', [id]);
      if (!book) { await conn.rollback(); return next(makeError(404, 'Book not found.')); }
      const newAvailable = book.available_copies + Number(data.totalCopies) - book.total_copies;
      if (newAvailable < 0) { await conn.rollback(); return sendValidation(res, ['Cannot reduce total copies below the number currently on loan.']); }
      await conn.execute('UPDATE books SET title=?,author=?,isbn=?,category=?,shelf_location=?,total_copies=?,available_copies=? WHERE id=?', [data.title.trim(), data.author.trim(), data.isbn.trim(), data.category.trim(), data.shelfLocation.trim(), Number(data.totalCopies), newAvailable, id]);
      await conn.commit();
      const [[updated]] = await pool.execute(`SELECT ${BOOK_FIELDS} FROM books WHERE id=?`, [id]);
      res.json({ book: updated });
    } catch (error) {
      await conn.rollback();
      if (error.code === 'ER_DUP_ENTRY') return next(makeError(409, 'Another book already uses this ISBN.'));
      next(error);
    } finally { conn.release(); }
  });
  app.delete('/api/books/:id', roles('Admin'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [[count]] = await pool.execute('SELECT COUNT(*) AS count FROM loans WHERE book_id=?', [id]);
      if (Number(count.count)) return next(makeError(409, 'This book has loan history and cannot be deleted.'));
      const [result] = await pool.execute('DELETE FROM books WHERE id=?', [id]);
      if (!result.affectedRows) return next(makeError(404, 'Book not found.'));
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/loans', auth, async (req, res, next) => {
    try {
      const params = [];
      let where = '';
      if (!['Admin', 'Staff'].includes(req.session.role)) { where = 'WHERE l.user_id=?'; params.push(req.session.id); }
      const [rows] = await pool.execute(`SELECT ${LOAN_FIELDS} FROM loans l JOIN books b ON b.id=l.book_id JOIN users u ON u.id=l.user_id ${where} ORDER BY l.issued_on DESC`, params);
      const status = req.query.status;
      const loans = rows.filter(row => status === 'active' ? !row.returnedOn : status === 'overdue' ? !row.returnedOn && row.overdueDays > 0 : true).map(row => ({ ...row, fine: row.returnedOn ? Number(row.fineAmount) : calculateFine(row.overdueDays, finePerDay) }));
      res.json({ loans, finePerDay });
    } catch (error) { next(error); }
  });
  app.post('/api/loans', roles('Admin', 'Staff'), async (req, res, next) => {
    const bookId = Number(req.body?.bookId);
    const userId = Number(req.body?.userId);
    if (!Number.isInteger(bookId) || bookId < 1 || !Number.isInteger(userId) || userId < 1) return next(makeError(400, 'Select a student and a book.'));
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[user]] = await conn.execute('SELECT id,full_name AS fullName,role FROM users WHERE id=? FOR UPDATE', [userId]);
      const [[book]] = await conn.execute('SELECT id,title,available_copies AS availableCopies FROM books WHERE id=? FOR UPDATE', [bookId]);
      if (!user || !book) { await conn.rollback(); return next(makeError(404, 'Member or book not found.')); }
      if (user.role !== 'Student') { await conn.rollback(); return next(makeError(400, 'Only student accounts can borrow books.')); }
      if (book.availableCopies < 1) { await conn.rollback(); return next(makeError(409, `No copies of '${book.title}' are available.`)); }
      const [[active]] = await conn.execute(`SELECT COUNT(*) AS count, SUM(DATEDIFF(CURDATE(),due_on)>0) AS overdue FROM loans WHERE user_id=? AND returned_on IS NULL`, [userId]);
      if (Number(active.overdue || 0) > 0) { await conn.rollback(); return next(makeError(409, 'Borrowing restricted: the member has overdue books.')); }
      const [[unpaid]] = await conn.execute('SELECT COUNT(*) AS count FROM loans WHERE user_id=? AND returned_on IS NOT NULL AND fine_amount>0 AND fine_paid=FALSE', [userId]);
      if (Number(unpaid.count)) { await conn.rollback(); return next(makeError(409, 'Borrowing restricted: the member has unpaid fines.')); }
      if (Number(active.count) >= 3) { await conn.rollback(); return next(makeError(409, 'Limit reached: students may borrow up to 3 books at a time.')); }
      const [[duplicate]] = await conn.execute('SELECT id FROM loans WHERE user_id=? AND book_id=? AND returned_on IS NULL LIMIT 1', [userId, bookId]);
      if (duplicate) { await conn.rollback(); return next(makeError(409, 'The member already has a copy of this book.')); }
      await conn.execute('INSERT INTO loans (book_id,user_id,issued_on,due_on) VALUES (?,?,NOW(),DATE_ADD(CURDATE(),INTERVAL 14 DAY))', [bookId, userId]);
      await conn.execute('UPDATE books SET available_copies=available_copies-1 WHERE id=?', [bookId]);
      await conn.commit();
      res.status(201).json({ message: `Issued '${book.title}' to ${user.fullName}.`, success: true });
    } catch (error) { await conn.rollback(); next(error); }
    finally { conn.release(); }
  });
  app.post('/api/loans/:id/return', roles('Admin', 'Staff'), async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[loan]] = await conn.execute('SELECT * FROM loans WHERE id=? FOR UPDATE', [Number(req.params.id)]);
      if (!loan || loan.returned_on) { await conn.rollback(); return next(makeError(404, 'Loan not found or already returned.')); }
      const [[days]] = await conn.query('SELECT GREATEST(0,DATEDIFF(CURDATE(),?)) AS overdueDays', [loan.due_on]);
      const fine = calculateFine(days.overdueDays, finePerDay);
      await conn.execute('UPDATE loans SET returned_on=NOW(),fine_amount=?,fine_paid=? WHERE id=?', [fine, fine === 0, loan.id]);
      await conn.execute('UPDATE books SET available_copies=available_copies+1 WHERE id=?', [loan.book_id]);
      await conn.commit();
      res.json({ success: true, message: fine > 0 ? `Returned ${days.overdueDays} day(s) late. Fine: ₱${fine.toFixed(2)}.` : 'Returned on time. No fine.' });
    } catch (error) { await conn.rollback(); next(error); }
    finally { conn.release(); }
  });
  app.post('/api/loans/:id/pay-fine', roles('Admin', 'Staff'), async (req, res, next) => {
    try {
      const [result] = await pool.execute('UPDATE loans SET fine_paid=TRUE WHERE id=? AND returned_on IS NOT NULL AND fine_amount>0 AND fine_paid=FALSE', [Number(req.params.id)]);
      if (!result.affectedRows) return next(makeError(409, 'No unpaid fine found for this loan.'));
      res.json({ success: true, message: 'Fine marked as paid.' });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/dashboard', roles('Admin'), async (_req, res, next) => {
    try {
      const [[summary]] = await pool.query(`SELECT
        (SELECT COUNT(*) FROM books) AS titles,
        (SELECT COALESCE(SUM(total_copies),0) FROM books) AS copies,
        (SELECT COALESCE(SUM(available_copies),0) FROM books) AS available,
        (SELECT COUNT(*) FROM users WHERE role='Student') AS members,
        (SELECT COUNT(*) FROM loans WHERE returned_on IS NULL) AS activeLoans,
        (SELECT COALESCE(SUM(fine_amount),0) FROM loans WHERE fine_paid=TRUE AND fine_amount>0) AS finesCollected,
        (SELECT COALESCE(SUM(fine_amount),0) FROM loans WHERE returned_on IS NOT NULL AND fine_paid=FALSE) AS returnedUnpaid`);
      const [overdue] = await pool.query(`SELECT ${LOAN_FIELDS} FROM loans l JOIN books b ON b.id=l.book_id JOIN users u ON u.id=l.user_id WHERE l.returned_on IS NULL AND l.due_on<CURDATE() ORDER BY l.due_on`);
      const finesOutstanding = Number(summary.returnedUnpaid) + overdue.reduce((sum, loan) => sum + calculateFine(loan.overdueDays, finePerDay), 0);
      res.json({ ...summary, finesOutstanding, overdue: overdue.map(row => ({ ...row, fine: calculateFine(row.overdueDays, finePerDay) })) });
    } catch (error) { next(error); }
  });
  app.get('/api/admin/users', roles('Admin', 'Staff'), async (_req, res, next) => {
    try {
      const [users] = await pool.query(`SELECT u.id,u.full_name AS fullName,u.email,u.role,
        SUM(l.returned_on IS NULL) AS activeLoans FROM users u LEFT JOIN loans l ON l.user_id=u.id
        GROUP BY u.id ORDER BY u.role,u.full_name`);
      res.json({ users });
    } catch (error) { next(error); }
  });
  app.post('/api/admin/users', roles('Admin'), async (req, res, next) => {
    try {
      const data = req.body || {};
      const errors = validateRegistration(data);
      if (!validRole(data.role)) errors.push('Select a valid role.');
      if (sendValidation(res, errors)) return;
      const email = normalizeEmail(data.email);
      const [result] = await pool.execute('INSERT INTO users (full_name,email,password_hash,role) VALUES (?,?,?,?)', [data.fullName.trim(), email, hashPassword(data.password), data.role]).catch(error => {
        if (error.code === 'ER_DUP_ENTRY') throw makeError(409, 'This email is already registered.');
        throw error;
      });
      res.status(201).json({ user: { id: result.insertId, fullName: data.fullName.trim(), email, role: data.role } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/report', roles('Admin'), async (req, res, next) => {
    try {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(req.query.start || '') ? req.query.start : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const end = /^\d{4}-\d{2}-\d{2}$/.test(req.query.end || '') ? req.query.end : new Date().toISOString().slice(0, 10);
      const [loans] = await pool.execute(`SELECT ${LOAN_FIELDS} FROM loans l JOIN books b ON b.id=l.book_id JOIN users u ON u.id=l.user_id WHERE l.issued_on>=? AND l.issued_on<DATE_ADD(?,INTERVAL 1 DAY) ORDER BY l.issued_on DESC`, [start, end]);
      res.json({ start, end, loans: loans.map(loan => ({
        ...loan,
        fine: loan.returnedOn ? Number(loan.fineAmount) : calculateFine(loan.overdueDays, finePerDay),
      })) });
    } catch (error) { next(error); }
  });
  app.get('/api/admin/export/:type', roles('Admin'), async (req, res, next) => {
    try {
      const type = req.params.type;
      let headers;
      let rows;
      let filename;
      const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      if (type === 'inventory') {
        const [books] = await pool.query(`SELECT ${BOOK_FIELDS} FROM books ORDER BY title`);
        headers = ['Title','Author','ISBN','Category','Shelf','Total copies','Available','On loan'];
        rows = books.map(b => [b.title,b.author,b.isbn,b.category,b.shelfLocation,b.totalCopies,b.availableCopies,b.totalCopies-b.availableCopies]);
        filename = `inventory_${today}.csv`;
      } else if (['loans','overdue','fines'].includes(type)) {
        let sql = `SELECT ${LOAN_FIELDS} FROM loans l JOIN books b ON b.id=l.book_id JOIN users u ON u.id=l.user_id`;
        if (type === 'overdue') sql += ' WHERE l.returned_on IS NULL AND l.due_on<CURDATE()';
        if (type === 'fines') sql += ' WHERE (l.returned_on IS NULL AND l.due_on<CURDATE()) OR l.fine_amount>0';
        if (type === 'loans') sql += ' ORDER BY l.issued_on DESC';
        else sql += ' ORDER BY l.due_on';
        const [loans] = await pool.query(sql);
        if (type === 'loans') {
          headers = ['Issued','Due','Returned','Book','ISBN','Member','Email','Status','Days overdue','Fine','Fine paid'];
          rows = loans.map(l => [l.issuedOn,l.dueOn,l.returnedOn,l.bookTitle,l.isbn,l.memberName,l.memberEmail,l.returnedOn?'Returned':l.overdueDays>0?'Overdue':'Active',l.overdueDays,l.returnedOn?l.fineAmount:calculateFine(l.overdueDays,finePerDay),Number(l.fineAmount)>0?(l.finePaid?'Yes':'No'):'']);
        } else if (type === 'overdue') {
          headers = ['Book','ISBN','Member','Email','Due','Days late','Accrued fine'];
          rows = loans.map(l => [l.bookTitle,l.isbn,l.memberName,l.memberEmail,l.dueOn,l.overdueDays,calculateFine(l.overdueDays,finePerDay)]);
        } else {
          headers = ['Member','Email','Book','Due','Returned','Days overdue','Fine','Paid'];
          rows = loans.filter(l => (l.returnedOn ? Number(l.fineAmount) : calculateFine(l.overdueDays,finePerDay)) > 0).map(l => [l.memberName,l.memberEmail,l.bookTitle,l.dueOn,l.returnedOn,l.overdueDays,l.returnedOn?l.fineAmount:calculateFine(l.overdueDays,finePerDay),l.finePaid?'Yes':'No']);
        }
        filename = `${type}_${today}.csv`;
      } else return next(makeError(404, 'Unknown CSV export type.'));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvDocument(headers, rows));
    } catch (error) { next(error); }
  });

  app.use('/api', (_req, _res, next) => next(makeError(404, 'API route not found.')));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    const status = Number(error.status) || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Internal server error.' : error.message });
  });
  app.get('*path', (_req, res) => res.sendFile(path.resolve(here, '../public/index.html')));
  return app;
}
