"""Analytics page check: Recruitment and Offboarding tabs, for a BU admin and a
super admin, at desktop and phone width. Fails on page errors, empty charts,
sideways scroll, or a broken export.

Run like offboarding_smoke.py (servers via with_server.py):
  python3 analytics_check.py <seed.json> <out dir>
"""
import json, os, subprocess, sys
from playwright.sync_api import sync_playwright, expect

BE = os.environ.get('BACKEND_DIR', '/home/claude/wct-job-app-backend')
FE = 'http://localhost:8080'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/analytics_shots'
os.makedirs(OUT, exist_ok=True)
tok = lambda *a: subprocess.check_output(['node', 'test/e2e/token.js', *a], cwd=BE).decode()
HR = tok('admin', 'hr.land@wct.my', 'Land', '{"bu_admin":true,"payroll_pic":false,"clearance_department_ids":[]}')
SUPER = tok('admin', 'boss@wct.my', 'ALL')
errors, problems = [], []
import glob
CHARTJS = (glob.glob('/tmp/claude-0/chartjs/node_modules/chart.js/dist/chart.umd*.js') or [''])[0]

def charts(pg):
    return pg.evaluate("Object.values(analyticsCharts).map(c => [c.canvas.id, c.data.datasets.reduce((s,d)=>s+d.data.reduce((a,b)=>a+(+b||0),0),0)])")

with sync_playwright() as p:
    b = p.chromium.launch()
    for who, token, scope in [('hr', HR, 'Land'), ('super', SUPER, 'ALL')]:
        for w in [1440, 390]:
            ctx = b.new_context(viewport={'width': w, 'height': 900}, accept_downloads=True)
            pg = ctx.new_page()
            # The sandbox can't reach the CDN: serve the same Chart.js 4 build locally.
            pg.route('**/npm/chart.js@4*', lambda r: r.fulfill(path=CHARTJS, content_type='application/javascript'))
            pg.on('pageerror', lambda e: errors.append(f'{who}{w}: {e}'))
            pg.on('console', lambda m: errors.append(f'{who}{w}: {m.text}') if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
            pg.goto(f'{FE}/admin.html')
            pg.evaluate("([t,s])=>{localStorage.setItem('wct_admin_token',t);sessionStorage.setItem('wct_admin_scope',s);}", [token, scope])
            pg.goto(f'{FE}/admin.html'); pg.wait_for_load_state('networkidle')
            pg.evaluate("setView('analytics')"); pg.wait_for_selector('#chartFunnel'); pg.wait_for_timeout(600)
            rec = charts(pg)
            if len(rec) < 8: problems.append(f'{who}{w}: only {len(rec)} recruitment charts')
            notes = pg.locator('.an-empty').count()
            if notes != 1: problems.append(f'{who}{w}: expected 1 no-data note (seed has no ages), got {notes}')
            if who == 'super' and not pg.query_selector('#chartByUnit'): problems.append('super: no BU chart')
            if who == 'hr' and pg.query_selector('#chartByUnit'): problems.append('hr: BU chart should be hidden')
            if pg.evaluate('document.documentElement.scrollWidth > innerWidth + 1'): problems.append(f'{who}{w}: recruitment scrolls sideways')
            pg.screenshot(path=f'{OUT}/{who}_recruitment_{w}.png', full_page=True)
            if w == 1440:
                with pg.expect_download() as d:
                    pg.get_by_role('button', name='Export CSV').click()
                csv = open(d.value.path(), encoding='utf-8-sig').read()
                if 'Hiring funnel' not in csv or 'Top positions applied for' not in csv: problems.append(f'{who}: recruitment CSV missing charts')

            pg.get_by_role('button', name='Offboarding', exact=True).last.click()
            pg.wait_for_selector('.an-table'); pg.wait_for_timeout(600)
            ob = charts(pg)
            if len(ob) < 6: problems.append(f'{who}{w}: only {len(ob)} offboarding charts')
            leavers = pg.locator('.metric-card', has_text='Leavers').locator('.metric-value').inner_text()
            expect_leavers = '6' if who == 'hr' else '7'
            if leavers != expect_leavers: problems.append(f'{who}{w}: leavers {leavers}, expected {expect_leavers}')
            overdue = pg.locator('.metric-card', has_text='Overdue').locator('.metric-value').inner_text()
            if overdue != '2': problems.append(f'{who}{w}: overdue {overdue}, expected 2')
            rows = pg.locator('.an-table tbody tr').count()
            if rows != 6: problems.append(f'{who}{w}: department table has {rows} rows')
            if pg.evaluate('document.documentElement.scrollWidth > innerWidth + 1'): problems.append(f'{who}{w}: offboarding scrolls sideways')
            pg.screenshot(path=f'{OUT}/{who}_offboarding_{w}.png', full_page=True)
            if who == 'super' and w == 1440:
                pg.select_option('select[aria-label="Business unit"]', 'Mall'); pg.wait_for_timeout(800)
                if pg.locator('.metric-card', has_text='Leavers').locator('.metric-value').inner_text() != '1': problems.append('super: Mall filter not applied')
                pg.select_option('select[aria-label="Period"]', '3'); pg.wait_for_timeout(800)
                with pg.expect_download() as d:
                    pg.get_by_role('button', name='Export CSV').click()
                csv = open(d.value.path(), encoding='utf-8-sig').read()
                if 'Department,Avg. days' not in csv.replace('"', '') or 'Mall' not in csv: problems.append('super: offboarding CSV incomplete')
            ctx.close()
    b.close()

print('PROBLEMS', json.dumps(problems, indent=1))
print('ERRORS', errors[:10])
sys.exit(1 if problems or errors else 0)
