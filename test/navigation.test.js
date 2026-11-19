import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthNavigationAlignment, getDefaultRoute, getLogoutLabel, getNavigationLinks, getPublicNavigationLinks } from '../public/navigation.js';

test('unauthenticated navigation and logout use Login and Logout labels', () => {
  assert.deepEqual(getPublicNavigationLinks(), [['Login', '#login'], ['Register', '#register']]);
  assert.equal(getLogoutLabel(), 'Logout');
});

test('anonymous sign-in and registration links align right, authenticated links align left', () => {
  assert.equal(getAuthNavigationAlignment(false), 'ms-auto');
  assert.equal(getAuthNavigationAlignment(true), 'me-auto');
});

test('admins land on Dashboard and see it first in navigation', () => {
  assert.equal(getDefaultRoute('Admin'), 'dashboard');
  assert.equal(getNavigationLinks('Admin')[0][0], 'Dashboard');
  assert.equal(getNavigationLinks('Admin')[0][1], '#dashboard');
});

test('staff and students keep their books-first navigation without an admin dashboard', () => {
  for (const role of ['Staff', 'Student']) {
    assert.equal(getDefaultRoute(role), 'books');
    assert.equal(getNavigationLinks(role)[0][0], 'Books');
    assert.ok(!getNavigationLinks(role).some(([label]) => label === 'Dashboard'));
  }
});
