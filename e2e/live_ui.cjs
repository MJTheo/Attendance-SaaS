// Live end-to-end UI suite against a deployed Landas Time.
//
// Signs in through the real sign-in form as the test org's staff, admin and
// super admin (E2E_* env vars) and checks what each role can see and do, plus
// a read-only pass through the public "View live demo" login.
//
// Writes to production: one rename of the test org, immediately reverted.
// Run e2e/live_api.py first so there's request data to look at.
// Screenshots go to e2e/output/ (gitignored).
//
// Usage: cd e2e && npm install && npx playwright install chromium && node live_ui.cjs

const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const BASE = (process.env.E2E_BASE_URL || 'https://attendance-saa-s.vercel.app').replace(/\/$/, '')
const OUT = path.join(__dirname, 'output')
const results = []

function check(area, name, ok, detail = '') {
  results.push({ area, name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} [${area}] ${name}${detail ? '  — ' + detail : ''}`)
}

for (const role of ['SUPERADMIN', 'ADMIN', 'STAFF']) {
  for (const part of ['EMAIL', 'PASSWORD']) {
    if (!process.env[`E2E_${role}_${part}`]) {
      console.error(`Missing E2E_${role}_${part} — see e2e/README.md`)
      process.exit(1)
    }
  }
}

async function open(browser, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark' })
  const page = await context.newPage()
  const errors = { api: [], page: [] }
  page.on('response', (r) => {
    const url = new URL(r.url())
    if (url.origin !== BASE && !/supabase\.co$/.test(url.hostname) && r.status() >= 400) {
      errors.api.push(`${r.status()} ${r.request().method()} ${url.pathname}`)
    }
  })
  page.on('pageerror', (e) => errors.page.push(e.message))
  return { context, page, errors }
}

async function signIn(browser, role, viewport) {
  const s = await open(browser, viewport)
  await s.page.goto(`${BASE}/signin`)
  await s.page.fill('input[type=email]', process.env[`E2E_${role}_EMAIL`])
  await s.page.fill('input[type=password]', process.env[`E2E_${role}_PASSWORD`])
  await s.page.click('button[type=submit]')
  await s.page.waitForSelector('aside nav', { timeout: 20000 })
  return s
}

// Pages show in-place skeletons (aria-busy) while their data loads; wait for
// those (and any older "Loading…" text) to clear before reading the page.
function waitForData(page) {
  return page
    .waitForFunction(() => !document.querySelector('[aria-busy="true"]') && !document.body.innerText.includes('Loading…'), null, { timeout: 15000 })
    .catch(() => {})
}

async function visit(s, route, heading) {
  s.errors.api.length = 0
  s.errors.page.length = 0
  await s.page.goto(BASE + route)
  if (heading) await s.page.waitForSelector(`h1:has-text("${heading}")`, { timeout: 15000 }).catch(() => {})
  await s.page.waitForLoadState('networkidle')
  await waitForData(s.page)
  return { path: new URL(s.page.url()).pathname, problems: [...s.errors.api, ...s.errors.page] }
}

async function shot(s, name) {
  await s.page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

async function staff(browser) {
  const s = await signIn(browser, 'STAFF')
  await visit(s, '/')
  const links = (await s.page.locator('aside nav a').allInnerTexts()).map((t) => t.trim())
  check('staff', 'Nav is four plain links, no dropcards',
    JSON.stringify(links) === JSON.stringify(['Dashboard', 'Calendar', 'Leave', 'Corrections']) &&
      (await s.page.locator('aside nav button').count()) === 0, links.join(', '))
  const dash = await s.page.locator('main').innerText()
  // The streak pill sits in the page header, above the Today card.
  check('staff', 'Dashboard shows the today card and streak', /Today/.test(dash) && /Streak/.test(dash))
  await shot(s, 'staff-dashboard')
  for (const route of ['/team', '/analytics', '/company', '/approvals/leave', '/approvals/corrections']) {
    const v = await visit(s, route)
    check('staff', `${route} redirects to the dashboard`, v.path === '/', v.path)
  }
  for (const [route, heading] of [['/calendar', null], ['/requests/leave', 'Leave'],
                                  ['/requests/corrections', 'Corrections']]) {
    const v = await visit(s, route, heading)
    check('staff', `${route} loads cleanly`, v.path === route && !v.problems.length, v.problems.join('; '))
  }
  await visit(s, '/')
  await s.page.click('[aria-label="Profile menu"]')
  check('staff', 'Profile menu has My profile and Sign out',
    (await s.page.locator('aside a:has-text("My profile")').count()) === 1 &&
      (await s.page.locator('aside button:has-text("Sign out")').count()) === 1)
  await s.page.click('aside a:has-text("My profile")')
  await s.page.waitForSelector('h1:has-text("My profile")')
  await waitForData(s.page)
  // innerText follows CSS text-transform, so section headings come back uppercase.
  const profileText = await s.page.locator('main').innerText()
  // live_api.py files name changes for this account, so the history must list them.
  check('staff', 'My profile shows details and request history',
    /request a change/i.test(profileText) && /Name change[\s\S]*→/.test(profileText))
  await shot(s, 'staff-profile')
  await visit(s, '/calendar', null)
  check('staff', 'Calendar has no team view', (await s.page.locator('main button', { hasText: /^Team$/ }).count()) === 0)
  await s.context.close()

  const m = await signIn(browser, 'STAFF', { width: 390, height: 844 })
  await visit(m, '/')
  await m.page.click('[aria-label="Open navigation menu"]')
  await m.page.waitForTimeout(400)
  check('staff', 'Mobile drawer opens', (await m.page.locator('aside').boundingBox()).x >= 0)
  await m.page.click('aside nav a:has-text("Calendar")')
  await m.page.waitForTimeout(400)
  check('staff', 'Mobile drawer closes after navigating', (await m.page.locator('aside').boundingBox()).x < 0)
  check('staff', 'No horizontal scroll on mobile',
    !(await m.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)))
  await m.context.close()
}

async function admin(browser) {
  const s = await signIn(browser, 'ADMIN')
  for (const [route, heading] of [['/', null], ['/calendar', null], ['/requests/leave', 'Leave'],
                                  ['/approvals/leave', 'Leave approvals'], ['/requests/corrections', 'Corrections'],
                                  ['/approvals/corrections', 'Correction approvals'], ['/team', 'Team'],
                                  ['/analytics', 'Analytics'], ['/company', 'Company']]) {
    const v = await visit(s, route, heading)
    check('admin', `${route} loads cleanly`, v.path === route && !v.problems.length, v.problems.join('; '))
  }
  await visit(s, '/company', 'Company')
  check('admin', 'Company: no Rename button', (await s.page.locator('button', { hasText: 'Rename' }).count()) === 0)
  check('admin', 'Company: working days editable', await s.page.locator('button[aria-label="Monday"]').isEnabled())
  await shot(s, 'admin-company')
  await visit(s, '/team', 'Team')
  check('admin', 'Team: Roles tab hidden', (await s.page.locator('[role=tab]:has-text("Roles")').count()) === 0)
  await s.page.click('[role=tab]:has-text("Requests")')
  check('admin', 'Team: profile change queue shown',
    await s.page.waitForSelector('h2:has-text("Profile changes waiting")', { timeout: 15000 }).then(() => true, () => false))
  check('admin', 'Team: no org settings left on this page', (await s.page.locator('text=Organization settings').count()) === 0)
  await visit(s, '/')
  for (const [label, heading] of [['Leave', 'Leave approvals'], ['Corrections', 'Correction approvals']]) {
    await s.page.click(`aside nav button:has-text("${label}")`)
    await s.page.click('aside nav a:has-text("Approvals")')
    await s.page.waitForSelector(`h1:has-text("${heading}")`)
    const cls = await s.page.locator(`aside nav button:has-text("${label}")`).getAttribute('class')
    check('admin', `${label} menu navigates and stays highlighted`, /font-semibold/.test(cls || ''))
  }
  const before = await s.page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  await s.page.locator('aside button:has-text(" theme")').first().click()
  const after = await s.page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  check('admin', 'Theme toggle switches theme', before !== after, `${before} -> ${after}`)
  await s.page.locator('aside button:has-text(" theme")').first().click()
  await s.context.close()
}

async function superAdmin(browser) {
  const s = await signIn(browser, 'SUPERADMIN')
  await visit(s, '/company', 'Company')
  const name = (await s.page.locator('#org-heading').innerText()).trim()
  check('super', 'Company: Rename button shown', (await s.page.locator('button', { hasText: 'Rename' }).count()) === 1)
  await s.page.click('button:has-text("Rename")')
  await s.page.fill('#org-name', `${name} (renamed)`)
  await s.page.click('button:has-text("Save name")')
  await s.page.waitForSelector(`text=${name} (renamed)`)
  await s.page.click('button:has-text("Rename")')
  await s.page.fill('#org-name', name)
  await s.page.click('button:has-text("Save name")')
  await s.page.waitForFunction((n) => !document.querySelector('#org-name') && document.body.innerText.includes(n), name)
  check('super', 'Rename through the UI and back', true, name)
  await shot(s, 'super-company')
  await visit(s, '/team', 'Team')
  await s.page.click('[role=tab]:has-text("Roles")')
  await s.page.waitForSelector('section[aria-label="Team roles"]')
  const selects = await s.page.locator('section[aria-label="Team roles"] select[aria-label^="Role for"]').count()
  check('super', 'Team roles list the other members', selects >= 2, `${selects} selectors`)
  check('super', 'Own role selector is locked', (await s.page.locator('text=Your own role is locked').count()) === 1)
  await shot(s, 'super-team')
  const v = await visit(s, '/analytics', 'Analytics')
  check('super', 'Analytics loads cleanly', !v.problems.length, v.problems.join('; '))
  await shot(s, 'super-analytics')
  await s.context.close()
}

async function publicDemo(browser) {
  const s = await open(browser)
  await s.page.goto(`${BASE}/signin`)
  await s.page.click('text=View live demo')
  await s.page.waitForSelector('aside nav', { timeout: 20000 })
  const v = await visit(s, '/company', 'Company')
  const text = await s.page.locator('main').innerText()
  check('demo', 'Public demo login reaches the app', v.path === '/company' && !v.problems.length, v.problems.join('; '))
  check('demo', 'Demo org is read-only for rename and settings',
    /demo/.test(text) && (await s.page.locator('button', { hasText: 'Rename' }).count()) === 0 &&
      (await s.page.locator('button[aria-label="Monday"]').isDisabled()))
  await s.context.close()
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  for (const [area, fn] of [['staff', staff], ['admin', admin], ['super', superAdmin], ['demo', publicDemo]]) {
    try {
      await fn(browser)
    } catch (e) {
      check(area, 'section crashed', false, e.message.split('\n')[0])
    }
  }
  await browser.close()
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length} checks, ${results.length - failed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})()
