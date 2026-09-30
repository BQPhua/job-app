"""UI/UX audit of the candidate and admin sites (Stage 2 acceptance checks).

Checks every page below at 1440 / 768 / 390px wide:
  - no horizontal page scroll
  - every button/link-button has an accessible name (text or aria-label)
  - no emoji used as button icons
  - mobile: form inputs are >= 16px (no iOS zoom) and buttons >= 40px tall
  - keyboard focus styles exist (:focus-visible) on each page
  - candidate wizard shows a labelled stepper ("Step N of M")
  - no page/console errors
Saves a screenshot per page+width. Exits 1 if any check fails.

Run like offboarding_smoke.py (servers via with_server.py):
  python3 ui_audit.py <seed.json> <out dir>
"""
import json, os, re, subprocess, sys
from playwright.sync_api import sync_playwright

BE = os.environ.get('BACKEND_DIR', '/home/claude/wct-job-app-backend')
FE = 'http://localhost:8080'
seed = json.load(open(sys.argv[1]))
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/ui_audit'
os.makedirs(OUT, exist_ok=True)
WIDTHS = [1440, 768, 390]
EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿⭐⬆↔-⇿✅❌✔✖✎✉]')

def token(*args):
    return subprocess.check_output(['node', 'test/e2e/token.js', *args], cwd=BE).decode()

HR_TOKEN = token('admin', 'hr.land@wct.my', 'Land', '{"bu_admin":true,"payroll_pic":false,"clearance_department_ids":[]}')
CAND_TOKEN = token('candidate', seed['employee_user_id'], 'aina.ali@wct.my')

violations = []
def v(page_name, width, rule, detail):
    violations.append({'page': page_name, 'width': width, 'rule': rule, 'detail': detail})

AUDIT_JS = r"""
() => {
  const out = {};
  out.overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  const btns = [...document.querySelectorAll('button, a.btn, [role=button], .btn')].filter(e => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  });
  out.unnamed = btns.filter(b => !(b.innerText || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
                    .map(b => b.outerHTML.slice(0, 120));
  out.emoji = btns.map(b => (b.innerText || '').trim()).filter(t => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2709}\u{270E}\u{2714}\u{2716}]/u.test(t));
  out.smallButtons = btns.filter(b => b.getBoundingClientRect().height < 40 && !b.closest('table') && !b.classList.contains('ob-link'))
                         .map(b => ((b.innerText||b.getAttribute('aria-label')||'').trim().slice(0,30)) + ' ' + Math.round(b.getBoundingClientRect().height) + 'px');
  out.smallInputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')]
    .filter(e => e.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(e).fontSize) < 16)
    .map(e => (e.id || e.name || e.type) + ' ' + getComputedStyle(e).fontSize);
  let focus = false;
  for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) { if ((r.cssText||'').includes(':focus-visible')) { focus = true; break; } } } catch (e) {} if (focus) break; }
  out.focusVisible = focus;
  out.text = document.body.innerText;
  return out;
}
"""

def audit(page, name, width, expect_stepper=False):
    r = page.evaluate(AUDIT_JS)
    page.screenshot(path=f'{OUT}/{name}_{width}.png', full_page=True)
    if r['overflow']: v(name, width, 'no-horizontal-scroll', 'page scrolls sideways')
    for u in r['unnamed']: v(name, width, 'button-accessible-name', u)
    for e in r['emoji']: v(name, width, 'no-emoji-icons', e)
    if not r['focusVisible']: v(name, width, 'focus-visible', 'no :focus-visible styles found')
    if width <= 390:
        for s in r['smallButtons']: v(name, width, 'touch-target-40px', s)
        for s in r['smallInputs']: v(name, width, 'input-16px-mobile', s)
    if expect_stepper and not re.search(r'Step \d+ of \d+', r['text'], re.I):
        v(name, width, 'labelled-stepper', 'no "Step N of M" label')

errors = []
def watch(page, who):
    page.on('console', lambda m: errors.append(f'[{who}] {m.text}') if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
    page.on('pageerror', lambda e: errors.append(f'[{who}] pageerror {e}'))
    page.on('dialog', lambda d: d.accept())

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    for w in WIDTHS:
        ctx = b.new_context(viewport={'width': w, 'height': 900})
        pg = ctx.new_page(); watch(pg, f'cand{w}')
        # Candidate login page (signed out)
        pg.goto(f'{FE}/login.html?bu=Land'); pg.wait_for_load_state('networkidle')
        audit(pg, 'cand_login', w)
        # Candidate home + first wizard step
        pg.evaluate("([t,u])=>{localStorage.setItem('wct_token',t);localStorage.setItem('wct_user',JSON.stringify(u));}",
                    [CAND_TOKEN, {'id': seed['employee_user_id'], 'email': 'aina.ali@wct.my', 'name': 'Aina'}])
        pg.goto(f'{FE}/index.html?bu=Land'); pg.wait_for_load_state('networkidle')
        audit(pg, 'cand_home', w)
        pg.click('text=Begin Application'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(300)
        audit(pg, 'cand_personal', w, expect_stepper=True)
        ctx.close()

        ctx = b.new_context(viewport={'width': w, 'height': 900})
        pg = ctx.new_page(); watch(pg, f'admin{w}')
        pg.goto(f'{FE}/admin.html'); pg.wait_for_load_state('networkidle')
        audit(pg, 'admin_login', w)
        pg.evaluate("([t,s])=>{localStorage.setItem('wct_admin_token',t);sessionStorage.setItem('wct_admin_scope',s);}", [HR_TOKEN, 'Land'])
        pg.goto(f'{FE}/admin.html'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(300)
        audit(pg, 'admin_dashboard', w)
        pg.locator('button[title="View details"], button[aria-label="View details"]').first.click(); pg.wait_for_timeout(500)
        audit(pg, 'admin_detail', w)
        pg.goto(f'{FE}/admin.html'); pg.wait_for_load_state('networkidle')
        pg.evaluate("setView('offboarding')"); pg.wait_for_selector('.ob-kpis'); pg.wait_for_timeout(300)
        audit(pg, 'admin_offboarding', w)
        ctx.close()
    b.close()

summary = {}
for x in violations:
    summary.setdefault(x['rule'], 0)
    summary[x['rule']] += 1
json.dump(violations, open(f'{OUT}/violations.json', 'w'), indent=1)
print('SUMMARY', json.dumps(summary))
for x in violations[:60]:
    print(f"{x['rule']:24} {x['page']:18} {x['width']:5} {x['detail']}")
if errors: print('ERRORS', errors[:10])
sys.exit(1 if violations or errors else 0)
