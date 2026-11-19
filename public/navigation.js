export function getAuthNavigationAlignment(isAuthenticated) {
  return isAuthenticated ? 'me-auto' : 'ms-auto';
}

export function getPublicNavigationLinks() {
  return [['Login', '#login'], ['Register', '#register']];
}

export function getLogoutLabel() {
  return 'Logout';
}

export function getDefaultRoute(role) {
  return role === 'Admin' ? 'dashboard' : 'books';
}

export function getNavigationLinks(role) {
  if (!['Student', 'Staff', 'Admin'].includes(role)) return [];
  const links = [];
  if (role === 'Admin') links.push(['Dashboard', '#dashboard']);
  links.push(['Books', '#books'], ['Loans', '#loans']);
  if (role === 'Admin' || role === 'Staff') links.push(['Issue book', '#issue'], ['Members', '#members']);
  if (role === 'Admin') links.push(['Reports', '#reports']);
  return links;
}
