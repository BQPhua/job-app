/* ==========================================================================
   Admin experience: first-login guided tour, ⌘/Ctrl K command palette,
   help menu, keyboard shortcuts and the dashboard greeting.
   Uses WX (wct-experience.js) and admin.html / offboarding-admin.js globals
   (adminToken, adminScope, currentView, setView, OB, applications, ...) at
   call time, the same way offboarding-admin.js does.
   ========================================================================== */
(function () {
  'use strict';

  const I = {
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    keyboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  };

  // ------------------------------------------------------------------------
  // Who is signed in (drives which tour, palette items and shortcuts apply)
  // ------------------------------------------------------------------------
  function roleInfo() {
    const roles = (typeof OB !== 'undefined' && OB.meta && OB.meta.roles) || {};
    const hr = typeof obIsHr === 'function' ? obIsHr() : false;
    const superAdmin = adminScope === 'ALL';
    const payroll = !!roles.payroll_pic && !superAdmin;
    const clearance = (roles.clearance_department_ids || []).length > 0 && !superAdmin;
    const superior = adminScope === 'SUPERIOR';
    let label = superAdmin ? 'Super Admin (all business units)'
      : hr ? `HR admin for ${adminScope}`
      : adminScope === 'GROUP' ? 'Payroll PIC (all business units)'
      : superior ? 'an immediate superior (Reporting Unit reviewer)'
      : payroll ? `Payroll PIC (all business units) and ${adminScope} staff`
      : clearance ? `Clearance PIC for ${adminScope}` : `${adminScope} staff`;
    return { hr, superAdmin, payroll, clearance, superior, label };
  }
  function firstName() {
    const n = (typeof currentUserProfile !== 'undefined' && currentUserProfile && currentUserProfile.name) || '';
    const clean = n.replace(/\(.*?\)/g, '').trim();
    return clean ? clean.split(/\s+/)[0] : '';
  }
  function email() {
    return ((typeof currentUserProfile !== 'undefined' && currentUserProfile && currentUserProfile.email)
      || (typeof OB !== 'undefined' && OB.meta && OB.meta.email) || 'admin').toLowerCase();
  }
  const navLink = (view) => () => document.querySelector(`#sidebarNav a[onclick*="'${view}'"]`);
  async function ensureView(view) { if (currentView !== view) await setView(view); }

  // ------------------------------------------------------------------------
  // Guided tour
  // ------------------------------------------------------------------------
  function tourKey() { return `admin:v1:${roleInfo().hr ? 'hr' : 'staff'}:${email()}`; }

  function hrSteps(r) {
    const name = firstName();
    return [
      { kind: 'intro', icon: I.spark, title: `Welcome${name ? `, ${name}` : ''}!`,
        body: `<p>This quick tour (about a minute) shows you where everything lives in the HR Admin Portal.</p>
               <p>You're signed in as <b>${WX.esc(r.label)}</b>.</p>` },
      { target: '#sidebarNav', placement: 'right', before: () => ensureView('home'), title: 'Your workspace',
        body: '<p>Every part of the portal is one click away here: applications, analytics, offboarding and settings.</p><p>The menu button at the top left collapses it when you need more room.</p>' },
      { target: '#dashStats', placement: 'bottom', before: () => ensureView('home'), title: 'Applicants at a glance',
        body: '<p>Each tile is also a filter. Click <b>New</b> to see applications waiting for your review.</p><p>The numbers update on their own as candidates submit.</p>' },
      { target: '#appMain .toolbar, #root .toolbar', placement: 'bottom', before: () => ensureView('home'), title: 'Find anyone fast',
        body: '<p>Search by name, reference number, email or phone, filter by status, and export what you see to CSV.</p><p>Tip: press <kbd>/</kbd> to jump straight into the search box.</p>' },
      { target: () => document.querySelector('#dashResults .apps-table tbody tr') || document.getElementById('dashResults'), placement: 'top', before: () => ensureView('home'), title: 'Review an application',
        body: '<ul><li>Click a candidate to open their full profile.</li><li>Change the status, download the PDF or start onboarding from there.</li><li>Tick several rows to act on them together.</li></ul>' },
      { target: navLink('offboarding'), optional: true, placement: 'right', title: 'Offboarding',
        body: '<p>Invite a leaver, follow their Exit Interview and six-department clearance, then hand over to Payroll.</p><p>The red badge counts tasks waiting on <b>you</b>. A step-by-step offboarding guide opens the first time you go there.</p>' },
      { target: navLink('analytics'), optional: true, placement: 'right', title: 'Analytics',
        body: '<p>Recruitment and offboarding trends in two tabs, ready to export as PDF or CSV.</p>' },
      r.superAdmin ? { target: navLink('adminAccess'), optional: true, placement: 'right', title: 'Admin Access',
        body: '<p>Invite colleagues and grant roles. <b>Payroll PIC</b> and <b>Super Admin</b> cover every business unit, so they need no unit.</p>' } : null,
      { target: '#liveDot', optional: true, placement: 'right', title: 'Live updates',
        body: "<p>When this shows <b>Live</b>, changes made by your teammates appear on your screen straight away. No refreshing needed.</p>" },
      { target: '#wxSearchBtn', optional: true, placement: 'bottom', title: 'Jump anywhere',
        body: `<p>Press <kbd>${WX.modLabel}</kbd> <kbd>K</kbd> to search applicants and offboarding cases, or jump to any page.</p>` },
      { target: '#wxHelpBtn', optional: true, placement: 'bottom', title: 'Help is always here',
        body: '<p>Replay this tour or see every keyboard shortcut from the Help menu any time.</p>' },
      { kind: 'outro', icon: I.flag, title: "You're all set", finishLabel: 'Start working',
        body: `<p>A few shortcuts to remember:</p><ul>
          <li><kbd>${WX.modLabel}</kbd> <kbd>K</kbd> search and jump</li>
          <li><kbd>G</kbd> then <kbd>D</kbd> dashboard, <kbd>G</kbd> then <kbd>O</kbd> offboarding</li>
          <li><kbd>?</kbd> all shortcuts</li></ul>` },
    ];
  }

  function staffSteps(r) {
    const name = firstName();
    const job = r.payroll ? 'process final pay once a leaver has acknowledged their clearance'
      : r.superior ? "sign the Reporting Unit checklist for the people who report to you"
      : "fill in and sign your department's clearance checklist for each leaver";
    return [
      { kind: 'intro', icon: I.spark, title: `Welcome${name ? `, ${name}` : ''}!`,
        body: `<p>You're signed in as <b>${WX.esc(r.label)}</b>. Your job here is to ${job}.</p><p>Here's a 30-second look around.</p>` },
      { target: '.ob-seg', placement: 'bottom', before: async () => { await ensureView('offboarding'); }, title: 'Two ways to look',
        body: `<p><b>My tasks</b> lists only what's waiting on you.${r.payroll ? ' <b>All cases</b> shows every leaver in every business unit, so you can see what is coming.' : ''}</p>` },
      { target: () => document.getElementById('obTasks') || document.getElementById('obResults'), placement: 'top',
        before: async () => { await ensureView('offboarding'); if (OB.view !== 'tasks') { obSetView('tasks'); await new Promise((res) => setTimeout(res, 300)); } },
        title: 'Your to-do list',
        body: r.payroll
          ? '<ul><li>Cases appear here once the employee acknowledges their clearance.</li><li>Open one, process the final pay, then click <b>Mark payroll done</b>.</li><li>The employee is emailed automatically.</li></ul>'
          : '<ul><li>Open a case to see its checklist.</li><li>Tick what your department has collected, add remarks, then sign.</li><li>Items closest to their last day are listed first.</li></ul>' },
      r.payroll ? { target: '#obKpis', placement: 'bottom', before: async () => { if (OB.view !== 'all') { obSetView('all'); await new Promise((res) => setTimeout(res, 400)); } }, title: 'Every business unit, at a glance',
        body: '<p>Payroll covers every business unit. These tiles count cases by status; click <b>Pending payroll</b> to filter.</p>' } : null,
      r.payroll ? { target: '.ob-toolbar', placement: 'bottom', title: 'Narrow it down',
        body: '<p>Search by name or reference, or filter by business unit, company and last day.</p>' } : null,
      { icon: I.exit, title: 'Inside a case',
        body: r.payroll
          ? `<ol><li>Click a case to open it.</li><li>Download the <b>Exit Interview</b> and <b>Clearance</b> PDFs from the buttons at the top (they are also attached to your email).</li><li>Process the final pay, then click <b>Mark payroll done</b> and add a remark if needed.</li></ol><p>If HR reopens a checklist, you'll get a "hold final pay" email and the case comes back later.</p>`
          : `<ol><li>Click a case. It opens on the <b>Clearance</b> tab at your ${r.superior ? 'Reporting Unit' : "department's"} checklist.</li><li>Tick each item returned or settled and add remarks (amounts owed, items missing).</li><li>Type your name and click <b>Sign</b>. Once signed it's locked; ask HR if something needs correcting.</li></ol><p>The <b>Timeline</b> tab shows every step and email on the case.</p>` },
      { target: '#liveDot', optional: true, placement: 'right', title: 'Live updates',
        body: '<p>New tasks and changes by HR appear on their own. The badge on <b>Offboarding</b> counts what is waiting on you.</p>' },
      { target: '#wxSearchBtn', optional: true, placement: 'bottom', title: 'Jump anywhere',
        body: `<p>Press <kbd>${WX.modLabel}</kbd> <kbd>K</kbd> to find a case by name or reference.</p>` },
      { target: '#wxHelpBtn', optional: true, placement: 'bottom', title: 'Help is always here',
        body: '<p>Replay this tour or view keyboard shortcuts from here any time.</p>' },
      { kind: 'outro', icon: I.flag, title: "You're all set", finishLabel: 'Go to my tasks',
        body: "<p>We'll email you whenever something new needs your attention.</p>" },
    ];
  }

  // ------------------------------------------------------------------------
  // Offboarding guide (HR): opens the first time HR visits Offboarding;
  // replay from Help or the command palette.
  // ------------------------------------------------------------------------
  function obTourKey() { return `admin-ob:v1:${email()}`; }
  async function ensureObAll() {
    await ensureView('offboarding');
    if (typeof OB !== 'undefined' && OB.view !== 'all') { obSetView('all'); await new Promise((res) => setTimeout(res, 400)); }
  }

  function obGuideSteps(r) {
    return [
      { kind: 'intro', icon: I.exit, title: 'How offboarding works',
        body: `<p>Every leaver goes through five stages. The portal emails the right person at each one.</p>
          <ol style="text-align:left;margin:10px auto 0;max-width:330px"><li><b>Invite</b>: you send the employee their link.</li>
          <li><b>Exit Interview</b>: the employee fills it in.</li>
          <li><b>Clearance</b>: six departments tick and sign their checklists.</li>
          <li><b>Acknowledge</b>: the employee confirms the result.</li>
          <li><b>Payroll</b>: Payroll processes final pay and closes the case.</li></ol>` },
      { target: '.ob-head-actions .btn-primary', optional: true, placement: 'bottom', before: ensureObAll, title: 'Start with Invite employee',
        body: '<ul><li>Enter the employee\'s email, position, last day and <b>immediate superior\'s email</b> (they sign the Reporting Unit).</li><li>If the person was hired through the portal, their details fill in for you.</li><li>The employee gets an email with a personal link to their Exit Interview.</li></ul>' },
      { target: '.ob-seg', placement: 'bottom', before: ensureObAll, title: 'All cases or just yours',
        body: '<p><b>All cases</b> lists every leaver in your business unit.</p><p><b>My tasks</b> shows only what is waiting on you, such as the HR checklist you sign for each case.</p>' },
      { target: '#obKpis', placement: 'bottom', before: ensureObAll, title: 'Where every case stands',
        body: '<p>Each tile counts cases at one stage. Click a tile to filter the list, and click it again to clear.</p><p><b>Overdue</b> lights up red when a last day has passed and clearance is still open.</p>' },
      { target: '.ob-toolbar', optional: true, placement: 'bottom', before: ensureObAll, title: 'Find a case',
        body: '<p>Search by name, email, reference or position, and filter by status, department, company or last day.</p><p><b>Export CSV</b> (top right) downloads exactly what you see.</p>' },
      { target: '#obResults', placement: 'top', before: ensureObAll, title: 'Follow progress',
        body: '<ul><li><b>Clearance</b> shows how many of the six checklists are signed.</li><li><b>Waiting on</b> tells you who is holding the case up.</li><li>Tick several cases to <b>remind</b> all their pending departments at once.</li></ul>' },
      { icon: I.exit, title: 'Inside a case',
        body: `<p>Click any row to open the case. Across the top:</p>
          <ul><li><b>Remind pending</b>, <b>Resend invite</b> or <b>Copy invite link</b> if someone is stuck.</li>
          <li><b>Exit Interview</b> and <b>Clearance</b> PDFs once they are ready.</li>
          <li><b>Cancel case</b> if the employee withdraws their resignation.</li></ul>
          <p>Tabs: <b>Overview</b> (edit details or the superior's email), <b>Exit Interview</b>, <b>Clearance</b> and <b>Timeline</b> (every step and email).</p>` },
      { icon: I.exit, title: 'When a department is away',
        body: `<ul><li>On the <b>Clearance</b> tab you can fill in and sign any checklist <b>on behalf</b> of a department. It is recorded as signed by HR on behalf.</li>
          <li>If a signed checklist is wrong, click <b>Reopen checklist</b>. The employee re-acknowledges, and Payroll is told to hold final pay.</li>
          <li>Nobody can sign a checklist on their own offboarding case.</li></ul>` },
      { icon: I.bolt, title: 'Reminders run on their own',
        body: `<p>Every morning at 9:00 the portal emails:</p>
          <ul><li>departments whose checklist is still open as the last day gets close,</li>
          <li>employees who haven't done their Exit Interview or acknowledgement after a few days,</li>
          <li>Payroll if final pay is still pending a few days after acknowledgement.</li></ul>
          <p>Each reminder appears on the case <b>Timeline</b>.</p>` },
      { kind: 'outro', icon: I.flag, title: 'Ready to offboard', finishLabel: 'Got it',
        body: `<p>Replay this guide any time from <b>Help (?)</b> → <b>Offboarding guide</b>.</p>` },
    ];
  }

  function startOffboardingTour() {
    if (!adminToken || typeof WX === 'undefined') return;
    helpMenuOpen = false; renderTools();
    const r = roleInfo();
    if (!r.hr) return startAdminTour();
    WX.tour.start({
      key: obTourKey(),
      label: 'Offboarding guide',
      startLabel: 'Show me',
      skipLabel: 'Skip, I know the process',
      steps: obGuideSteps(r),
      onEnd: (reason) => {
        if (reason === 'skipped') WX.toast('Guide skipped. Replay it any time from Help (?)');
      },
    });
  }

  // First visit to Offboarding by an HR admin (not while another tour runs,
  // and not when they arrived through a link that opened a case).
  function maybeStartOffboardingTour() {
    if (!adminToken || typeof WX === 'undefined' || WX.tour.active) return;
    if (!roleInfo().hr || WX.tour.isDone(obTourKey())) return;
    if (new URLSearchParams(location.search).get('tour') === 'off') return;
    setTimeout(() => {
      if (WX.tour.active || !adminToken || currentView !== 'offboarding') return;
      if (document.querySelector('#obDrawer[open], dialog[open]')) return;
      startOffboardingTour();
    }, 700);
  }

  function startAdminTour() {
    if (!adminToken || typeof WX === 'undefined') return;
    helpMenuOpen = false; renderTools();
    const r = roleInfo();
    WX.tour.start({
      key: tourKey(),
      label: 'Quick tour',
      steps: r.hr ? hrSteps(r) : staffSteps(r),
      onEnd: (reason) => {
        if (!r.hr && typeof OB !== 'undefined' && OB.view !== 'tasks' && currentView === 'offboarding') obSetView('tasks');
        if (reason === 'skipped') WX.toast('Tour skipped. Replay it any time from Help (?)');
        else if (reason === 'done') WX.toast("You're all set", { kind: 'ok' });
      },
    });
  }

  // Show the tour once per person (and per HR/staff role) on this browser.
  let tourChecked = false;
  function maybeStartAdminTour() {
    if (tourChecked || !adminToken || typeof WX === 'undefined') return;
    tourChecked = true;
    if (new URLSearchParams(location.search).get('tour') === 'off') return;
    if (WX.tour.isDone(tourKey())) return;
    // Don't interrupt a deep link (opening a case/application from an email).
    if (document.querySelector('dialog.ob-modal[open], .ob-drawer.open, #modalRoot')) return;
    setTimeout(() => { if (!WX.tour.active && adminToken) startAdminTour(); }, 650);
  }

  // ------------------------------------------------------------------------
  // Command palette
  // ------------------------------------------------------------------------
  function paletteSource(q) {
    const groups = [];
    const pages = Array.from(document.querySelectorAll('#sidebarNav a')).map((a) => ({
      label: (a.querySelector('.nav-label') || a).textContent.trim(),
      hint: 'Page', icon: (a.querySelector('svg') || {}).outerHTML || '', run: () => a.click(),
    }));
    groups.push({ title: 'Pages', items: pages, limit: 8 });

    if (typeof obIsHr === 'function' && obIsHr() && Array.isArray(applications) && applications.length) {
      groups.push({ title: 'Applications', limit: q ? 6 : 3, items: applications.map((a) => ({
        label: a.name_nric || a.reference_no || 'Application',
        hint: [a.reference_no, (typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[a.status]) || a.status].filter(Boolean).join(' · '),
        keywords: [a.email, a.mobile_phone, a.position_applying, a.business_unit].filter(Boolean).join(' '),
        icon: I.person,
        run: async () => { if (currentView !== 'home') await setView('home'); openDetail(a.id); },
      })) });
    }

    if (typeof OB !== 'undefined') {
      const seen = new Set();
      const cases = [];
      const add = (id, name, ref, extra) => { if (!id || seen.has(id)) return; seen.add(id); cases.push({ id, name, ref, extra }); };
      ((OB.tasks && OB.tasks.sections) || []).forEach((s) => add(s.case_id, s.employee_name, s.ref_no, `${s.department_name || 'Checklist'} to sign`));
      ((OB.tasks && OB.tasks.payroll) || []).forEach((p) => add(p.id, p.employee_name, p.ref_no, 'Final pay to process'));
      ((OB.data && OB.data.rows) || []).forEach((c) => add(c.id, c.employee_name, c.ref_no, (typeof OB_STATUS_LABELS !== 'undefined' && OB_STATUS_LABELS[c.status]) || c.status));
      if (cases.length) {
        groups.push({ title: 'Offboarding cases', limit: q ? 6 : 3, items: cases.map((c) => ({
          label: c.name || c.ref, hint: [c.ref, c.extra].filter(Boolean).join(' · '), keywords: c.ref, icon: I.exit,
          run: async () => { if (currentView !== 'offboarding') await setView('offboarding'); obOpenCase(c.id); },
        })) });
      }
    }

    const r = roleInfo();
    const actions = [];
    if (r.hr) {
      actions.push({ label: 'Invite an employee to offboard', icon: I.plus, keywords: 'leaver resign exit new case', run: async () => { await ensureView('offboarding'); obOpenInvite(); } });
      actions.push({ label: 'Export applications to CSV', icon: I.bolt, keywords: 'download excel', run: async () => { await ensureView('home'); exportCsv(); } });
    }
    actions.push({ label: 'Replay the guided tour', icon: I.replay, keywords: 'help onboarding walkthrough', run: startAdminTour });
    if (r.hr) actions.push({ label: 'Offboarding guide', icon: I.exit, keywords: 'help offboarding tour walkthrough leaver clearance', run: async () => { await ensureView('offboarding'); startOffboardingTour(); } });
    actions.push({ label: 'Keyboard shortcuts', icon: I.keyboard, keywords: 'help keys', run: showShortcuts });
    actions.push({ label: 'Toggle sidebar', icon: I.bolt, keywords: 'collapse menu', run: () => toggleSidebar() });
    actions.push({ label: 'Log out', icon: I.exit, keywords: 'sign out', run: () => logout() });
    groups.push({ title: 'Actions', items: actions, limit: q ? 4 : 6 });

    if (q && r.hr) {
      groups.push({ title: 'Search', limit: 1, items: [{
        label: `Search all applications for “${q}”`, keywords: q, icon: I.search,
        run: async () => {
          await ensureView('home');
          const el = document.getElementById('searchInput');
          if (el) { el.value = q; el.focus(); }
          handleSearchInput(q);
        },
      }] });
    }
    return groups;
  }
  function openPalette() {
    if (!adminToken || WX.tour.active) return;
    helpMenuOpen = false; renderTools();
    WX.palette.toggle({ source: paletteSource, placeholder: roleInfo().hr ? 'Search applicants, cases or pages…' : 'Search cases or pages…' });
    // Offboarding cases only load when that page is first opened; fetch them
    // in the background so the palette can find a leaver from anywhere.
    if (typeof OB !== 'undefined' && !OB.data && typeof obLoadList === 'function') {
      obLoadList().then(() => WX.palette.refresh()).catch(() => {});
    }
  }

  function showShortcuts() {
    helpMenuOpen = false; renderTools();
    const hr = roleInfo().hr;
    const k = (...ks) => ks.map((x) => `<kbd>${x}</kbd>`).join(' ');
    WX.dialog({
      title: 'Keyboard shortcuts',
      html: `<dl class="wx-keys">
        <dt>${k(WX.modLabel, 'K')}</dt><dd>Search and jump anywhere</dd>
        <dt>${k('/')}</dt><dd>Focus the search box on this page</dd>
        ${hr ? `<dt>${k('G')} then ${k('D')}</dt><dd>Go to Dashboard</dd>
        <dt>${k('G')} then ${k('A')}</dt><dd>Go to Analytics</dd>` : ''}
        <dt>${k('G')} then ${k('O')}</dt><dd>Go to Offboarding</dd>
        <dt>${k('?')}</dt><dd>Show this list</dd>
        <dt>${k('Esc')}</dt><dd>Close a dialog or the tour</dd>
      </dl>`,
    });
  }

  // ------------------------------------------------------------------------
  // Topbar tools (search trigger + help menu), rendered by renderTopbarUser
  // ------------------------------------------------------------------------
  let helpMenuOpen = false;
  function toolsHtml() {
    return `
      <div class="wx-topbar-tools">
        <button type="button" class="wx-search-btn" id="wxSearchBtn" onclick="WXA.openPalette()" aria-label="Search or jump to (${WX.modLabel}+K)">
          ${I.search}<span>Search or jump to…</span><kbd>${WX.modLabel} K</kbd>
        </button>
        <div class="wx-menu-wrap">
          <button type="button" class="wx-icon-btn" id="wxHelpBtn" onclick="WXA.toggleHelp(event)" aria-haspopup="menu" aria-expanded="${helpMenuOpen}" aria-label="Help">${I.help}</button>
          ${helpMenuOpen ? `
            <div class="wx-menu" role="menu" aria-label="Help">
              <button type="button" role="menuitem" onclick="WXA.startTour()">${I.replay} Replay the guided tour</button>
              ${roleInfo().hr ? `<button type="button" role="menuitem" onclick="WXA.startOffboardingTour()">${I.exit} Offboarding guide</button>` : ''}
              <button type="button" role="menuitem" onclick="WXA.showShortcuts()">${I.keyboard} Keyboard shortcuts <kbd>?</kbd></button>
              <button type="button" role="menuitem" onclick="WXA.openPalette()">${I.search} Search or jump to <kbd>${WX.modLabel} K</kbd></button>
            </div>` : ''}
        </div>
      </div>`;
  }
  function renderTools() {
    const host = document.getElementById('wxTools');
    if (host) host.innerHTML = adminToken ? toolsHtml() : '';
  }
  function toggleHelp(e) {
    if (e) e.stopPropagation();
    helpMenuOpen = !helpMenuOpen;
    renderTools();
    if (helpMenuOpen) { const first = document.querySelector('.wx-menu button'); if (first) first.focus(); }
  }
  document.addEventListener('click', (e) => {
    if (helpMenuOpen && !e.target.closest('.wx-menu-wrap')) { helpMenuOpen = false; renderTools(); }
  });
  document.addEventListener('keydown', (e) => {
    if (helpMenuOpen && e.key === 'Escape') { helpMenuOpen = false; renderTools(); const b = document.getElementById('wxHelpBtn'); if (b) b.focus(); }
  });

  // ------------------------------------------------------------------------
  // Greeting on the dashboard subtitle
  // ------------------------------------------------------------------------
  function greeting() {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const name = firstName();
    const day = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return `${part}${name ? `, ${name}` : ''} · ${day}`;
  }

  // ------------------------------------------------------------------------
  // Shortcuts
  // ------------------------------------------------------------------------
  function focusSearch() {
    const el = document.querySelector('#searchInput, #obSearch, #root input[type="search"]');
    if (el) { el.focus(); el.select && el.select(); }
  }
  WX.keys({
    'mod+k': () => openPalette(),
    '/': () => { if (adminToken) focusSearch(); },
    '?': () => { if (adminToken) showShortcuts(); },
    'g d': () => { if (adminToken && roleInfo().hr) setView('home'); },
    'g a': () => { if (adminToken && roleInfo().hr) setView('analytics'); },
    'g o': () => { if (adminToken) setView('offboarding'); },
  });

  window.WXA = { startTour: startAdminTour, maybeStartTour: maybeStartAdminTour, startOffboardingTour, maybeStartOffboardingTour, openPalette, showShortcuts, toggleHelp, renderTools, greeting, resetTourCheck: () => { tourChecked = false; } };
})();
