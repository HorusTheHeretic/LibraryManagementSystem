import { getAuthNavigationAlignment, getDefaultRoute, getLogoutLabel, getNavigationLinks, getPublicNavigationLinks } from './navigation.js';

const app = document.querySelector('#app');
const message = document.querySelector('#message');
const navLinks = document.querySelector('#navLinks');
const identity = document.querySelector('#identity');
const logout = document.querySelector('#logout');
let user = null;
let currentBooks = [];
let categories = [];

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => `₱${Number(value || 0).toFixed(2)}`;
const date = value => value ? new Date(`${String(value).slice(0,10)}T00:00:00`).toLocaleDateString() : '—';

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) },
  });
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') || '';
  if (type.includes('text/csv')) return response.blob();
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function flash(text, type = 'success') {
  message.innerHTML = `<div class="alert alert-${type} alert-dismissible" role="alert">${esc(text)}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`;
  window.scrollTo({top:0,behavior:'smooth'});
}
function setUser(next) {
  user = next;
  navLinks.classList.remove('me-auto', 'ms-auto');
  navLinks.classList.add(getAuthNavigationAlignment(Boolean(user)));
  identity.textContent = user ? `${user.fullName} · ${user.role}` : '';
  logout.textContent = getLogoutLabel();
  logout.classList.toggle('d-none', !user);
  const links = user ? getNavigationLinks(user.role) : getPublicNavigationLinks();
  navLinks.innerHTML = links.map(([label, href]) => `<a class="nav-link" href="${href}">${label}</a>`).join('');
}
function title(text, extra = '') { return `<div class="d-flex justify-content-between align-items-center mb-3"><h2 class="mb-0">${text}</h2>${extra}</div>`; }
function empty(text) { return `<div class="text-center text-secondary p-4">${text}</div>`; }
function stat(label, value) { return `<div class="col-6 col-md-3"><div class="card h-100"><div class="card-body"><div class="small text-secondary">${esc(label)}</div><div class="stat-value">${esc(value)}</div></div></div></div>`; }

async function showLogin() {
  app.innerHTML = `<div class="card auth-card"><div class="card-body p-4"><h2 class="mb-3">Login</h2>
    <form id="loginForm"><label class="form-label">Email</label><input class="form-control mb-3" name="email" type="email" autocomplete="username" required>
    <label class="form-label">Password</label><input class="form-control mb-3" name="password" type="password" autocomplete="current-password" required>
    <button class="btn btn-primary w-100">Login</button></form>
    <p class="small text-secondary mt-3 mb-0">Demo: admin@library.local / Admin@123 · staff@library.local / Staff@123 · student@library.local / Student@123</p>
    <p class="mt-3 mb-0">New here? <a href="#register">Create a student account</a></p></div></div>`;
}
async function showRegister() {
  app.innerHTML = `<div class="card auth-card"><div class="card-body p-4"><h2 class="mb-3">Create student account</h2>
    <form id="registerForm"><label class="form-label">Full name</label><input class="form-control mb-3" name="fullName" maxlength="100" required>
    <label class="form-label">Email</label><input class="form-control mb-3" name="email" type="email" maxlength="150" required>
    <label class="form-label">Password</label><input class="form-control mb-3" name="password" type="password" minlength="6" maxlength="100" required>
    <label class="form-label">Confirm password</label><input class="form-control mb-3" name="confirmPassword" type="password" required>
    <button class="btn btn-primary w-100">Register</button></form></div></div>`;
}
async function showBooks() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const result = await api(`/api/books?${params}`);
  currentBooks = result.books; categories = result.categories;
  const isAdmin = user.role === 'Admin';
  app.innerHTML = `${title('Books', isAdmin ? '<a class="btn btn-primary" href="#book-new">+ Add book</a>' : '')}
    <form id="bookSearch" class="row g-2 mb-3"><div class="col-md-5"><input name="q" class="form-control" placeholder="Search title, author or ISBN" value="${esc(params.get('q') || '')}"></div>
    <div class="col-md-3"><select class="form-select" name="category"><option value="">All categories</option>${categories.map(c => `<option ${params.get('category')===c?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
    <div class="col"><button class="btn btn-secondary">Search</button></div></form>
    <div class="table-responsive"><table class="table table-striped align-middle"><thead><tr><th>Title</th><th>Author</th><th>ISBN</th><th>Category</th><th>Shelf</th><th>Available</th>${isAdmin?'<th></th>':''}</tr></thead><tbody>
    ${currentBooks.map(b => `<tr><td>${esc(b.title)}</td><td>${esc(b.author)}</td><td>${esc(b.isbn)}</td><td>${esc(b.category)}</td><td>${esc(b.shelfLocation)}</td><td><span class="badge text-bg-${b.availableCopies?'success':'danger'}">${b.availableCopies} / ${b.totalCopies}</span></td>${isAdmin?`<td class="actions text-end"><a class="btn btn-sm btn-outline-primary" href="#book-edit/${b.id}">Edit</a> <button data-action="delete-book" data-id="${b.id}" class="btn btn-sm btn-outline-danger">Delete</button></td>`:''}</tr>`).join('')}
    </tbody></table></div>${currentBooks.length?'':empty('No books found.')}`;
}
function bookForm(book = {}) {
  const editing = Boolean(book.id);
  app.innerHTML = `${title(editing ? 'Edit book' : 'Add book')}<div class="card"><div class="card-body"><form id="bookForm" class="row g-3">
    <div class="col-md-6"><label class="form-label">Title</label><input class="form-control" name="title" maxlength="200" required value="${esc(book.title)}"></div>
    <div class="col-md-6"><label class="form-label">Author</label><input class="form-control" name="author" maxlength="150" required value="${esc(book.author)}"></div>
    <div class="col-md-6"><label class="form-label">ISBN</label><input class="form-control" name="isbn" maxlength="17" required value="${esc(book.isbn)}"></div>
    <div class="col-md-6"><label class="form-label">Category</label><input class="form-control" name="category" maxlength="80" required value="${esc(book.category)}"></div>
    <div class="col-md-6"><label class="form-label">Shelf location</label><input class="form-control" name="shelfLocation" maxlength="50" required value="${esc(book.shelfLocation)}"></div>
    <div class="col-md-6"><label class="form-label">Total copies</label><input class="form-control" type="number" name="totalCopies" min="1" max="1000" required value="${book.totalCopies ?? 1}"></div>
    <div class="col-12"><button class="btn btn-primary">${editing?'Save changes':'Add book'}</button> <a class="btn btn-outline-secondary" href="#books">Cancel</a></div>
    </form></div></div>`;
  app.querySelector('#bookForm').dataset.id = book.id || '';
}
async function showLoans() {
  const status = new URLSearchParams(location.hash.split('?')[1] || '').get('status') || '';
  const {loans, finePerDay} = await api(`/api/loans${status?`?status=${status}`:''}`);
  const desk = ['Admin','Staff'].includes(user.role);
  app.innerHTML = `${title(desk?'All loans':'My loans', desk?'<a class="btn btn-primary" href="#issue">Issue a book</a>':'')}
    <p class="text-secondary">Fine rate: ${money(finePerDay)} per overdue day.</p>
    <div class="btn-group btn-group-sm mb-3"><a class="btn ${!status?'btn-dark':'btn-outline-dark'}" href="#loans">All</a><a class="btn ${status==='active'?'btn-dark':'btn-outline-dark'}" href="#loans?status=active">Active</a><a class="btn ${status==='overdue'?'btn-dark':'btn-outline-dark'}" href="#loans?status=overdue">Overdue</a></div>
    <div class="table-responsive"><table class="table table-striped"><thead><tr><th>Book</th>${desk?'<th>Member</th>':''}<th>Issued</th><th>Due</th><th>Returned</th><th>Status</th><th>Fine</th>${desk?'<th></th>':''}</tr></thead><tbody>
    ${loans.map(l => {const state=l.returnedOn?'Returned':l.overdueDays>0?`Overdue ${l.overdueDays}d`:'Active';return `<tr><td>${esc(l.bookTitle)}</td>${desk?`<td>${esc(l.memberName)}</td>`:''}<td>${date(l.issuedOn)}</td><td>${date(l.dueOn)}</td><td>${date(l.returnedOn)}</td><td><span class="badge text-bg-${l.returnedOn?'secondary':l.overdueDays>0?'danger':'primary'}">${state}</span></td><td>${Number(l.fine)>0?`${money(l.fine)} ${l.returnedOn?`<span class="badge text-bg-${l.finePaid?'success':'warning'}">${l.finePaid?'Paid':'Unpaid'}</span>`:''}`:'—'}</td>${desk?`<td class="actions text-end">${!l.returnedOn?`<button data-action="return-loan" data-id="${l.id}" class="btn btn-sm btn-success">Return</button>`:Number(l.fine)>0&&!l.finePaid?`<button data-action="pay-fine" data-id="${l.id}" class="btn btn-sm btn-warning">Mark paid</button>`:''}</td>`:''}</tr>`;}).join('')}
    </tbody></table></div>${loans.length?'':empty('No loans to show.')}`;
}
async function showIssue() {
  const [{users}, {books}] = await Promise.all([api('/api/admin/users'),api('/api/books')]);
  const students = users.filter(u=>u.role==='Student'); const available = books.filter(b=>b.availableCopies>0);
  app.innerHTML = `${title('Issue a book')}<p class="text-secondary">Students may hold 3 books for 14 days. Overdue books and unpaid fines block new loans.</p>
    <div class="card"><div class="card-body"><form id="issueForm" class="col-lg-7"><label class="form-label">Student</label><select name="userId" class="form-select mb-3" required><option value="">Select student</option>${students.map(u=>`<option value="${u.id}">${esc(u.fullName)}</option>`).join('')}</select>
    <label class="form-label">Book</label><select name="bookId" class="form-select mb-3" required><option value="">Select available book</option>${available.map(b=>`<option value="${b.id}">${esc(b.title)} — ${esc(b.author)} (${b.availableCopies} available)</option>`).join('')}</select>
    <button class="btn btn-primary">Issue book</button></form></div></div>`;
}
async function showMembers() {
  const {users} = await api('/api/admin/users');
  app.innerHTML = `${title('Members',user.role==='Admin'?'<a class="btn btn-primary" href="#member-new">+ Add account</a>':'')}
    <div class="table-responsive"><table class="table table-striped"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Books on loan</th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.fullName)}</td><td>${esc(u.email)}</td><td><span class="badge text-bg-secondary">${esc(u.role)}</span></td><td>${u.activeLoans||0}</td></tr>`).join('')}</tbody></table></div>`;
}
function memberForm() {
  app.innerHTML = `${title('Create account')}<div class="card"><div class="card-body"><form id="memberForm" class="row g-3 col-lg-8">
    <div class="col-md-6"><label class="form-label">Full name</label><input class="form-control" name="fullName" maxlength="100" required></div><div class="col-md-6"><label class="form-label">Email</label><input class="form-control" name="email" type="email" maxlength="150" required></div>
    <div class="col-md-6"><label class="form-label">Password</label><input class="form-control" name="password" type="password" minlength="6" required></div><div class="col-md-6"><label class="form-label">Confirm password</label><input class="form-control" name="confirmPassword" type="password" required></div>
    <div class="col-md-6"><label class="form-label">Role</label><select class="form-select" name="role"><option>Student</option><option>Staff</option><option>Admin</option></select></div><div class="col-12"><button class="btn btn-primary">Create account</button> <a class="btn btn-outline-secondary" href="#members">Cancel</a></div></form></div></div>`;
}
async function showDashboard() {
  const d = await api('/api/admin/dashboard');
  app.innerHTML = `${title('Admin dashboard')}<div class="row g-3 mb-4">${stat('Titles',d.titles)}${stat('Copies available',`${d.available} / ${d.copies}`)}${stat('Members',d.members)}${stat('Active loans',d.activeLoans)}${stat('Overdue',d.overdue.length)}${stat('Fines outstanding',money(d.finesOutstanding))}${stat('Fines collected',money(d.finesCollected))}</div>
    <h4>Overdue books</h4><div class="table-responsive"><table class="table table-striped"><thead><tr><th>Book</th><th>Member</th><th>Due</th><th>Days late</th><th>Accrued fine</th></tr></thead><tbody>${d.overdue.map(l=>`<tr><td>${esc(l.bookTitle)}</td><td>${esc(l.memberName)}</td><td>${date(l.dueOn)}</td><td>${l.overdueDays}</td><td>${money(l.fine)}</td></tr>`).join('')}</tbody></table></div>${d.overdue.length?'':empty('Nothing overdue.')}`;
}
async function showReports() {
  const today = new Date().toISOString().slice(0,10); const month = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const start = params.get('start') || month, end = params.get('end') || today;
  const {loans} = await api(`/api/admin/report?start=${start}&end=${end}`);
  app.innerHTML = `${title('Reports')}<form id="reportForm" class="row g-2 align-items-end mb-3"><div class="col-auto"><label class="form-label">Start</label><input class="form-control" type="date" name="start" value="${start}"></div><div class="col-auto"><label class="form-label">End</label><input class="form-control" type="date" name="end" value="${end}"></div><div class="col-auto"><button class="btn btn-secondary">Apply</button></div></form>
    <div class="d-flex gap-2 flex-wrap mb-3">${['loans','overdue','fines','inventory'].map(t=>`<button class="btn btn-outline-primary btn-sm" data-action="export" data-type="${t}">Download ${t} CSV</button>`).join('')}</div>
    <div class="table-responsive"><table class="table table-striped"><thead><tr><th>Issued</th><th>Due</th><th>Book</th><th>Member</th><th>Status</th><th>Fine</th></tr></thead><tbody>${loans.map(l=>`<tr><td>${date(l.issuedOn)}</td><td>${date(l.dueOn)}</td><td>${esc(l.bookTitle)}</td><td>${esc(l.memberName)}</td><td>${l.returnedOn?'Returned':l.overdueDays>0?'Overdue':'Active'}</td><td>${Number(l.fine)>0?money(l.fine):'—'}</td></tr>`).join('')}</tbody></table></div>${loans.length?'':empty('No loans in this date range.')}`;
}

async function render() {
  message.innerHTML = '';
  const route = location.hash.replace(/^#/, '') || (user ? getDefaultRoute(user.role) : 'login');
  if (!user && !['login','register'].includes(route)) return location.hash = '#login';
  if (!user) return route === 'register' ? showRegister() : showLogin();
  if (route === 'login' || route === 'register') return location.hash = `#${getDefaultRoute(user.role)}`;
  if (route === 'home' || route === 'books') return showBooks();
  if (route.startsWith('book-new')) return user.role==='Admin' ? bookForm() : flash('Admin access required.','danger');
  if (route.startsWith('book-edit/')) {
    if (user.role!=='Admin') return flash('Admin access required.','danger');
    const book = currentBooks.find(b=>b.id===Number(route.split('/')[1])) || (await api('/api/books')).books.find(b=>b.id===Number(route.split('/')[1]));
    return book ? bookForm(book) : flash('Book not found.','danger');
  }
  if (route.startsWith('loans')) return showLoans();
  if (route === 'issue') return ['Admin','Staff'].includes(user.role)?showIssue():flash('Staff access required.','danger');
  if (route === 'members') return showMembers();
  if (route === 'member-new') return user.role==='Admin'?memberForm():flash('Admin access required.','danger');
  if (route === 'dashboard') return user.role==='Admin'?showDashboard():flash('Admin access required.','danger');
  if (route.startsWith('reports')) return user.role==='Admin'?showReports():flash('Admin access required.','danger');
  location.hash = '#books';
}

function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
function download(blob, filename) { const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=filename; link.click(); URL.revokeObjectURL(link.href); }

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('form')) return;
  event.preventDefault();
  try {
    if (form.id === 'loginForm') {
      const result = await api('/api/auth/login',{method:'POST',body:JSON.stringify(formData(form))}); setUser(result.user); location.hash=`#${getDefaultRoute(result.user.role)}`; return;
    }
    if (form.id === 'registerForm') {
      const result = await api('/api/auth/register',{method:'POST',body:JSON.stringify(formData(form))}); setUser(result.user); location.hash='#books'; return;
    }
    if (form.id === 'bookSearch') {
      const data=formData(form); location.hash=`#books?${new URLSearchParams(data)}`; return;
    }
    if (form.id === 'bookForm') {
      const data=formData(form); data.totalCopies=Number(data.totalCopies); const id=form.dataset.id;
      await api(id?`/api/books/${id}`:'/api/books',{method:id?'PUT':'POST',body:JSON.stringify(data)});
      flash(id?'Book updated.':'Book added.'); location.hash='#books'; return;
    }
    if (form.id === 'issueForm') {
      const data=formData(form); data.userId=Number(data.userId); data.bookId=Number(data.bookId);
      const result=await api('/api/loans',{method:'POST',body:JSON.stringify(data)}); flash(result.message); location.hash='#loans'; return;
    }
    if (form.id === 'memberForm') {
      await api('/api/admin/users',{method:'POST',body:JSON.stringify(formData(form))}); flash('Account created.'); location.hash='#members'; return;
    }
    if (form.id === 'reportForm') { const data=formData(form); location.hash=`#reports?${new URLSearchParams(data)}`; return; }
  } catch(error) { flash(error.message,'danger'); }
});

document.addEventListener('click', async event => {
  const button=event.target.closest('[data-action]'); if(!button) return;
  try {
    const id=button.dataset.id;
    if(button.dataset.action==='delete-book' && confirm('Delete this book?')) { await api(`/api/books/${id}`,{method:'DELETE'}); flash('Book deleted.'); return render(); }
    if(button.dataset.action==='return-loan' && confirm('Mark this book as returned?')) { const result=await api(`/api/loans/${id}/return`,{method:'POST',body:'{}'}); flash(result.message); return render(); }
    if(button.dataset.action==='pay-fine' && confirm('Mark this fine as paid?')) { const result=await api(`/api/loans/${id}/pay-fine`,{method:'POST',body:'{}'}); flash(result.message); return render(); }
    if(button.dataset.action==='export') { const blob=await api(`/api/admin/export/${button.dataset.type}`); download(blob,`${button.dataset.type}.csv`); }
  } catch(error) { flash(error.message,'danger'); }
});

document.querySelector('#logout').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST',body:'{}'});setUser(null);location.hash='#login';});
window.addEventListener('hashchange',()=>render().catch(error=>flash(error.message,'danger')));

try { const result=await api('/api/auth/me'); setUser(result.user); }
catch { setUser(null); }
render().catch(error=>flash(error.message,'danger'));
