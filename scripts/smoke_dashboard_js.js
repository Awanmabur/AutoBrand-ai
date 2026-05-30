const fs = require('fs');
const vm = require('vm');

function makeClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    toggle: (name, force) => {
      const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
      if (shouldAdd) classes.add(name); else classes.delete(name);
      return shouldAdd;
    },
    contains: (name) => classes.has(name)
  };
}

function makeElement(id = '') {
  return {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    dataset: {},
    style: {},
    classList: makeClassList(),
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild(child) { this.child = child; return child; },
    content: { cloneNode() { return makeElement('template-clone'); } }
  };
}

const ids = new Map();
['themeToggle','themeToggleMenu','openDrawer','closeDrawer','sidebar','drawerBackdrop','pageTitle','pageRoot','searchInput','modalBackdrop','modalClose','modalKicker','modalTitle','modalBody','modalActions'].forEach((id) => ids.set(id, makeElement(id)));

const navLinks = ['overview','brand-brain','calendar','social','content-library','auto-handoff','unknown-page'].map((page) => ({
  dataset: { page },
  classList: makeClassList(),
  href: `/dashboard/${page}`,
  isConnected: true,
  addEventListener() {},
  setAttribute(name, value) { this[name] = value; },
  getAttribute(name) { return this[name] || ''; },
  remove() { this.isConnected = false; }
}));

const document = {
  body: makeElement('body'),
  getElementById(id) { return ids.get(id) || null; },
  createElement() { return makeElement('created'); },
  querySelector() { return null; },
  querySelectorAll(selector) { return selector === '[data-page]' ? navLinks : []; },
  addEventListener() {}
};

const location = { pathname: '/dashboard/unknown-page', search: '', hash: '' };
const history = { pushState(state, title, path) { location.pathname = path; }, replaceState(state, title, path) { location.pathname = path; } };
const localStorage = { getItem() { return null; }, setItem() {} };
const window = {
  __AUTOBRAND_DASHBOARD_DATA__: {
    initialPage: 'missing-page',
    generatedAt: new Date().toISOString(),
    pages: {},
    options: { brands: [], brandRecords: [], socialAccounts: [], calendar: { days: [], posts: [], weekdays: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] } },
    user: { name: 'Smoke User', firstName: 'Smoke', initials: 'SU' }
  },
  matchMedia() { return { matches: false }; },
  addEventListener() {},
  scrollTo() {}
};

const context = { document, window, localStorage, location, history, URLSearchParams, Intl, Date, String, Number, Boolean, Array, Object, Set, Map, console, requestAnimationFrame: (cb) => cb() };
context.globalThis = context;
vm.createContext(context);
const code = fs.readFileSync('public/js/dashboard-experience.js', 'utf8');
vm.runInContext(code, context, { filename: 'dashboard-experience.js' });
if (!ids.get('pageRoot').innerHTML.includes('Command center')) {
  throw new Error('Dashboard did not render fallback overview content');
}
console.log('[OK] dashboard JS fallback render smoke passed');
