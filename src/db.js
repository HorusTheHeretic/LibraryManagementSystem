import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { hashPassword } from './domain.js';

function readSettings() {
  try { return JSON.parse(fs.readFileSync(path.resolve('appsettings.json'), 'utf8')); }
  catch { return {}; }
}

function connectionStringValues(raw = '') {
  return Object.fromEntries(raw.split(';').filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i < 0 ? ['', ''] : [part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim()];
  }));
}

export function getDatabaseConfig(env = process.env, settings = readSettings()) {
  const cs = connectionStringValues(settings.ConnectionStrings?.Default);
  const placeholderPassword = ['***', 'YOUR_MYSQL_PASSWORD'].includes(cs.password) ? '' : cs.password;
  const database = env.DB_NAME || cs.database || 'librarydb';
  if (!/^[A-Za-z0-9_$-]+$/.test(database)) throw new Error('DB_NAME contains unsupported characters.');
  return {
    host: env.DB_HOST || cs.server || cs.host || 'localhost',
    port: Number(env.DB_PORT || cs.port || 3306),
    user: env.DB_USER || cs.user || cs.uid || 'root',
    password: env.DB_PASSWORD ?? placeholderPassword,
    database,
    finePerDay: Number(env.FINE_PER_DAY || settings.Library?.FinePerDay || 5),
  };
}

export async function createDatabasePool(config = getDatabaseConfig()) {
  const { database, finePerDay: _finePerDay, ...serverOptions } = config;
  const connection = await mysql.createConnection(serverOptions);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await connection.end();
  }
  return mysql.createPool({
    ...serverOptions,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
    decimalNumbers: true,
    charset: 'utf8mb4',
  });
}

async function migrateLegacySchema(pool) {
  const renames = {
    users: { FullName: 'full_name', PasswordHash: 'password_hash' },
    books: { ShelfLocation: 'shelf_location', TotalCopies: 'total_copies', AvailableCopies: 'available_copies' },
    loans: { BookId: 'book_id', UserId: 'user_id', IssuedOn: 'issued_on', DueOn: 'due_on', ReturnedOn: 'returned_on', FineAmount: 'fine_amount', FinePaid: 'fine_paid' },
  };
  for (const [table, mapping] of Object.entries(renames)) {
    const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    const columns = new Map(rows.map(column => [column.Field, column]));
    for (const [oldName, newName] of Object.entries(mapping)) {
      if (!columns.has(oldName) || columns.has(newName)) continue;
      const column = columns.get(oldName);
      let definition = `${column.Type}${column.Null === 'NO' ? ' NOT NULL' : ' NULL'}`;
      if (column.Default !== null) definition += ` DEFAULT ${String(column.Default).toUpperCase() === 'CURRENT_TIMESTAMP' ? 'CURRENT_TIMESTAMP' : pool.escape(column.Default)}`;
      if (String(column.Extra).includes('auto_increment')) definition += ' AUTO_INCREMENT';
      await pool.query(`ALTER TABLE \`${table}\` CHANGE COLUMN \`${oldName}\` \`${newName}\` ${definition}`);
      columns.delete(oldName);
      columns.set(newName, column);
    }
  }
  const [userColumns] = await pool.query('SHOW COLUMNS FROM users');
  const role = userColumns.find(column => column.Field.toLowerCase() === 'role');
  if (role && /^(tinyint|smallint|mediumint|int|bigint)/i.test(role.Type)) {
    await pool.query("ALTER TABLE users ADD COLUMN role_migrated ENUM('Student','Staff','Admin') NULL");
    await pool.query("UPDATE users SET role_migrated=CASE role WHEN 1 THEN 'Staff' WHEN 2 THEN 'Admin' ELSE 'Student' END");
    await pool.query('ALTER TABLE users DROP COLUMN role');
    await pool.query("ALTER TABLE users CHANGE COLUMN role_migrated role ENUM('Student','Staff','Admin') NOT NULL DEFAULT 'Student'");
  }
}

export async function initializeDatabase(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Student','Staff','Admin') NOT NULL DEFAULT 'Student',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS books (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(150) NOT NULL,
    isbn VARCHAR(17) NOT NULL UNIQUE,
    category VARCHAR(80) NOT NULL,
    shelf_location VARCHAR(50) NOT NULL,
    total_copies INT NOT NULL,
    available_copies INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS loans (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    user_id INT NOT NULL,
    issued_on DATETIME NOT NULL,
    due_on DATE NOT NULL,
    returned_on DATETIME NULL,
    fine_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    fine_paid BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_loans_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT,
    CONSTRAINT fk_loans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_loans_user_active (user_id, returned_on),
    INDEX idx_loans_due (due_on, returned_on)
  ) ENGINE=InnoDB`);
  await migrateLegacySchema(pool);
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM users');
  if (Number(count) !== 0) return;
  const users = [
    ['Head Librarian', 'admin@library.local', 'Admin@123', 'Admin'],
    ['Sam Staff', 'staff@library.local', 'Staff@123', 'Staff'],
    ['Stella Student', 'student@library.local', 'Student@123', 'Student'],
  ];
  for (const [name, email, password, role] of users) {
    await pool.execute('INSERT IGNORE INTO users (full_name,email,password_hash,role) VALUES (?,?,?,?)', [name, email, hashPassword(password), role]);
  }
  const books = [
    ['Clean Code', 'Robert C. Martin', '978-0132350884', 'Programming', 'A-01', 3],
    ['The Pragmatic Programmer', 'Andrew Hunt', '978-0135957059', 'Programming', 'A-02', 2],
    ['Introduction to Algorithms', 'Thomas H. Cormen', '978-0262046305', 'Computer Science', 'B-01', 2],
    ['A Brief History of Time', 'Stephen Hawking', '978-0553380163', 'Science', 'C-04', 1],
    ['Noli Me Tangere', 'Jose Rizal', '978-9712714979', 'Literature', 'D-10', 4],
    ['Database System Concepts', 'Abraham Silberschatz', '978-0078022159', 'Computer Science', 'B-03', 2],
  ];
  for (const book of books) {
    await pool.execute('INSERT IGNORE INTO books (title,author,isbn,category,shelf_location,total_copies,available_copies) VALUES (?,?,?,?,?,?,?)', [...book, book[5]]);
  }
}
