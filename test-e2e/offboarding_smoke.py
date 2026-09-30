"""End-to-end smoke test of the offboarding workflow, across every role.

Run from the backend repo root (servers are started by with_server.py):

  node test/e2e/seed.js > /tmp/e2e_seed.json
  python3 <webapp-testing>/scripts/with_server.py \
    --server "node test/e2e/server.js" --port 3000 \
    --server "python3 ../job-app/test-e2e/static_server.py 8080" --port 8080 \
    -- python3 ../job-app/test-e2e/offboarding_smoke.py /tmp/e2e_seed.json <screenshot dir>

Flow: HR invites a hired employee (details pre-filled) → the employee opens
the invite link, fills in and submits the Exit Interview → the IT PIC signs
IT → HR signs the other five on behalf → the employee acknowledges → the
Payroll PIC marks payroll done → HR sees the case Completed. Also checks the
emails that went to the Power Automate stub, and fails on any page error.
"""
import json, os, subprocess, sys, urllib.request
from playwright.sync_api import sync_playwright, expect

BE = os.environ.get('BACKEND_DIR', '/home/claude/wct-job-app-backend')
FE = 'http://localhost:8080'
seed = json.load(open(sys.argv[1]))
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/e2e_shots'
os.makedirs(OUT, exist_ok=True)

def token(*args):
    return subprocess.check_output(['node', 'test/e2e/token.js', *args], cwd=BE).decode()

def pa_calls():
    return json.loads(urllib.request.urlopen('http://127.0.0.1:3099/calls').read())

ROLES = {
    'hr': ('hr.land@wct.my', 'Land', '{"bu_admin":true,"payroll_pic":false,"clearance_department_ids":[]}'),
    'it': ('it.land@wct.my', 'Land', '{"bu_admin":false,"payroll_pic":false,"clearance_department_ids":[2]}'),
    'pay': ('pay.land@wct.my', 'Land', '{"bu_admin":false,"payroll_pic":true,"clearance_department_ids":[]}'),
}
errors = []
step_no = [0]

def shot(page, name):
    step_no[0] += 1
    page.screenshot(path=f'{OUT}/{step_no[0]:02d}_{name}.png', full_page=False)

def watch(page, who):
    def on_console(m):
        if m.type == 'error' and 'ERR_TUNNEL_CONNECTION_FAILED' not in m.text:
            errors.append(f'[{who}] console: {m.text}')
    page.on('console', on_console)
    page.on('pageerror', lambda e: errors.append(f'[{who}] pageerror: {e}'))
    page.on('dialog', lambda d: d.accept())  # confirm() prompts

def admin_page(browser, role):
    email, scope, roles = ROLES[role]
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = ctx.new_page()
    watch(page, role)
    page.goto(f'{FE}/admin.html')
    page.evaluate("([t,s])=>{localStorage.setItem('wct_admin_token',t);sessionStorage.setItem('wct_admin_scope',s);}",
                  [token('admin', email, scope, roles), scope])
    return ctx, page

def employee_page(browser, query=''):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
    page = ctx.new_page()
    watch(page, 'employee')
    page.goto(f'{FE}/login.html')
    page.evaluate("([t,u])=>{localStorage.setItem('wct_token',t);localStorage.setItem('wct_user',JSON.stringify(u));}",
                  [token('candidate', seed['employee_user_id'], 'aina.ali@wct.my'),
                   {'id': seed['employee_user_id'], 'email': 'aina.ali@wct.my', 'name': 'Aina'}])
    page.goto(f'{FE}/index.html{query}')
    page.wait_for_load_state('networkidle')
    return ctx, page

def dump(browser):
    for ci, c in enumerate(browser.contexts):
        for pi, pg in enumerate(c.pages):
            try:
                pg.screenshot(path=f'{OUT}/FAIL_{ci}_{pi}.png')
                print(f'--- FAIL page {ci}/{pi}: {pg.url}')
                print(pg.inner_text('body')[:1200])
            except Exception as e:
                print('dump failed', e)
    print('\n'.join(errors))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        # Start from an empty Power Automate stub (in case a previous run's server is still up).
        urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:3099/calls', method='DELETE'))
        run_flow = True

        # 1. HR invites the employee.
        ctx, hr = admin_page(browser, 'hr')
        hr.goto(f'{FE}/admin.html'); hr.wait_for_load_state('networkidle')
        hr.get_by_role('link', name='Offboarding').click() if hr.get_by_role('link', name='Offboarding').count() else hr.click('text=Offboarding')
        hr.wait_for_selector('.ob-kpis')
        shot(hr, 'hr_dashboard')
        hr.get_by_role('button', name='Invite employee').click()
        hr.fill('#obV_employee_email', 'aina.ali@wct.my')
        hr.press('#obV_employee_email', 'Tab')
        expect(hr.locator('#obV_employee_name')).to_have_value('Aina Binti Ali', timeout=5000)
        hr.fill('#obV_department', 'Construction')
        hr.fill('#obV_date_joined', '2022-03-01')
        hr.fill('#obV_immediate_superior_name', 'Evelyn Tan')
        shot(hr, 'hr_invite_form')
        hr.click('#obModalOk')
        hr.wait_for_selector('dialog.ob-drawer[open]')
        expect(hr.locator('#obDrawerTitle')).to_have_text('Aina Binti Ali')
        shot(hr, 'hr_case_invited')
        invite = [c for c in pa_calls() if c.get('event_type') == 'invite' and c['to'] == 'aina.ali@wct.my'][-1]
        link = invite['html'].split('href="')[1].split('"')[0]
        assert '/index.html?offboard=' in link, link
        ctx.close()

        # 2. Employee opens the invite link and submits the Exit Interview.
        ctx, emp = employee_page(browser, '?' + link.split('?')[1])
        emp.wait_for_selector('text=My Offboarding')
        shot(emp, 'employee_form_empty')
        emp.click('text=Submit Exit Interview')  # empty → inline errors, no submit
        expect(emp.locator('#obEmpErr_notice_period_days')).to_be_visible()
        emp.fill('#obEmpNotice', '0')
        emp.fill('#obEmpOfficial', '2026-12-31')
        emp.fill('#obEmpActual', '2026-12-24')
        emp.click('text=Better Offer')
        emp.click('text=Career Advancement')
        emp.fill('#obEmpOther', 'Moving closer to family')
        emp.locator('.ob-emp-other').get_by_role('button', name='Add').click()
        emp.fill('#obEmpComments', 'Thank you for a great three years.')
        emp.check('#obEmpDeclare')
        shot(emp, 'employee_form_filled')
        emp.click('text=Submit Exit Interview')
        emp.wait_for_selector('text=Department clearance (0/6)')
        shot(emp, 'employee_submitted')
        ctx.close()
        calls = pa_calls()
        assert any(c.get('event_type') == 'submitted_hr' for c in calls), 'HR not notified'
        assert sum(1 for c in calls if c.get('event_type') == 'clearance_task' and 'Aina' in c['subject']) == 6, 'expected 6 clearance tasks'

        # 3. IT PIC signs IT from My tasks.
        ctx, it = admin_page(browser, 'it')
        it.goto(f'{FE}/admin.html'); it.wait_for_load_state('networkidle')
        it.wait_for_selector('.ob-task')
        shot(it, 'it_my_tasks')
        it.locator('.ob-task', has_text='Aina Binti Ali').get_by_role('button', name='Open checklist').click()
        it.wait_for_selector('#obSec2[open]')
        boxes = it.locator('#obSec2 .ob-item input[type=checkbox]')
        for i in range(5):
            boxes.nth(i).check()
        it.locator('#obSec2 input[placeholder="Remarks (optional)"]').nth(4).fill('Laptop returned 24 Dec')
        shot(it, 'it_checklist_filled')
        it.locator('#obSec2').get_by_role('button', name='Sign IT').click()
        expect(it.locator('#obSec2')).to_have_class('ob-sec is-done', timeout=5000)
        shot(it, 'it_signed')
        ctx.close()

        # 4. HR signs the remaining five on behalf.
        ctx, hr = admin_page(browser, 'hr')
        hr.goto(f'{FE}/admin.html'); hr.wait_for_load_state('networkidle')
        hr.click('text=Offboarding'); hr.wait_for_selector('.ob-row')
        hr.fill('#obSearch', 'aina')
        hr.wait_for_timeout(700)
        rows = hr.locator('tr.ob-row')
        assert rows.count() == 1, f'search should find 1 row, found {rows.count()}'
        rows.first.click()
        hr.wait_for_selector('dialog.ob-drawer[open]')
        hr.get_by_role('tab', name='Clearance (1/6)').click()
        for dept, name in [(1, 'Reporting Unit'), (3, 'Administration'), (4, 'Finance'), (5, 'Purchasing'), (6, 'Human Resources')]:
            sec = hr.locator(f'#obSec{dept}')
            if not sec.evaluate('e => e.open'):
                sec.locator('summary').click()
            sec.locator(f'#obBehalf{dept}').check()
            sec.get_by_role('button', name=f'Sign {name}').click()
            expect(hr.locator(f'#obSec{dept}')).to_have_class('ob-sec is-done', timeout=5000)
        expect(hr.locator('.ob-drawer-top .ob-badge')).to_have_text('Pending acknowledgement')
        shot(hr, 'hr_all_signed')
        hr.get_by_role('tab', name='Exit Interview').click()
        hr.fill('#obHrPos', 'HR Executive')
        hr.click('text=Sign Section D')
        hr.wait_for_selector('text=Update sign-off')
        hr.get_by_role('tab', name='Timeline').click()
        shot(hr, 'hr_timeline')
        ctx.close()
        assert any(c.get('event_type') == 'ready_to_ack' for c in pa_calls()), 'employee not asked to acknowledge'

        # 5. Employee acknowledges from the home screen.
        ctx, emp = employee_page(browser)
        emp.click('text=Review & acknowledge')
        emp.wait_for_selector('text=Your exit clearance')
        shot(emp, 'employee_ack')
        emp.check('#obEmpAckDeclare')
        emp.click('text=Acknowledge & sign')
        emp.wait_for_selector('text=Final pay being processed', state='attached') if False else emp.wait_for_selector('text=Exit Clearance Form (PDF)')
        shot(emp, 'employee_after_ack')
        ctx.close()
        pay_mail = [c for c in pa_calls() if c.get('event_type') == 'payroll_action']
        assert pay_mail and pay_mail[-1]['to'] == 'pay.land@wct.my' and len(pay_mail[-1]['attachments']) == 2, 'payroll email wrong'

        # 6. Payroll PIC marks payroll done.
        ctx, pay = admin_page(browser, 'pay')
        pay.goto(f'{FE}/admin.html'); pay.wait_for_load_state('networkidle')
        pay.get_by_role('button', name='My tasks').click()
        pay.wait_for_selector('.ob-task')
        shot(pay, 'payroll_tasks')
        pay.locator('.ob-task', has_text='Aina Binti Ali').get_by_role('button', name='Open case').click()
        pay.wait_for_selector('dialog.ob-drawer[open]')
        pay.get_by_role('button', name='Mark payroll done').click()
        pay.fill('#obPayRemarks', 'Paid with December payroll')
        pay.click('#obModalOk')
        expect(pay.locator('.ob-drawer-top .ob-badge')).to_have_text('Completed', timeout=5000)
        shot(pay, 'payroll_done')
        ctx.close()
        assert any(c.get('event_type') == 'completed' and c['to'] == 'aina.ali@wct.my' for c in pa_calls()), 'completion email missing'

        # 7. HR dashboard shows it completed; status filter works.
        ctx, hr = admin_page(browser, 'hr')
        hr.goto(f'{FE}/admin.html'); hr.wait_for_load_state('networkidle')
        hr.click('text=Offboarding'); hr.wait_for_selector('.ob-row')
        hr.click('.ob-kpi:has-text("Completed this month")')
        hr.wait_for_timeout(700)
        assert hr.locator('tr.ob-row', has_text='Aina Binti Ali').count() == 1
        shot(hr, 'hr_completed_filter')
        # Mobile width sanity check.
        hr.set_viewport_size({'width': 390, 'height': 844})
        hr.wait_for_timeout(300)
        overflow = hr.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
        shot(hr, 'hr_mobile')
        assert not overflow, 'page scrolls horizontally on mobile'
        ctx.close()

    except Exception:
        dump(browser)
        raise
    browser.close()

if errors:
    print('PAGE ERRORS:\n' + '\n'.join(errors))
    sys.exit(1)
print(f'SMOKE PASSED — {step_no[0]} screenshots in {OUT}')
