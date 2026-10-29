// ============================================================================
// WCT shared front-end pieces (candidate index.html + admin.html), 2026-10-14.
//
//   - Business units: the managed list from the API (GET /api/business-units),
//     with a built-in fallback so pages still work if the API is older.
//   - Addresses (two lines + postcode/city/state), phone check (10-11 digits).
//   - Supporting-document sections (IC front/back, resume, academic, payslip,
//     other) and the photo sticker.
//   - ONE digital-signature component (type-to-sign) used everywhere a person
//     signs: PDPA consent, onboarding confirmations, offboarding declarations.
//     It never re-renders the page, so nothing typed elsewhere is lost.
//   - The job-application PDF (one layout for candidate and admin downloads).
//
// Needs api.js (API_BASE_URL) and logo.js (WCT_LOGO_DATA_URI) loaded first.
// ============================================================================

(function (global) {
  'use strict';

  const e = (v) => (v === null || v === undefined ? '' : String(v))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const dash = (v) => (v === null || v === undefined || v === '' ? '—' : e(v));
  // api.js declares API_BASE_URL with const (not on window); pages on the live
  // server also set window.API_BASE_URL before api.js loads.
  // eslint-disable-next-line no-undef
  // logo.js declares WCT_LOGO_DATA_URI with const (not on window).
  // eslint-disable-next-line no-undef
  const logoUri = () => (typeof WCT_LOGO_DATA_URI !== 'undefined' ? WCT_LOGO_DATA_URI : global.WCT_LOGO_DATA_URI) || '';
  const apiBase = () => (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : global.API_BASE_URL) || '/api';

  // --------------------------------------------------------------------------
  // Business units
  // --------------------------------------------------------------------------
  const BU_FALLBACK = [
    { code: 'E&C', name: 'E&C' }, { code: 'Land', name: 'Property Development' }, { code: 'Mall', name: 'Malls Management' },
    { code: 'REIT', name: 'REIT' }, { code: 'Aviation', name: 'Aviation' }, { code: 'F&B', name: 'F&B' }, { code: 'Hotels', name: 'Hotels' },
  ];
  let units = BU_FALLBACK.slice();

  async function loadBusinessUnits() {
    try {
      const res = await fetch(`${apiBase()}/business-units`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length) units = data;
      }
    } catch (err) { /* keep the fallback */ }
    return units;
  }
  /** Replace the list (admin pages load the full list, inactive units too). */
  function setBusinessUnits(list) { if (Array.isArray(list) && list.length) units = list; }
  function businessUnits() { return units.slice(); }
  function buName(code) {
    const u = units.find((x) => x.code === code);
    return u ? u.name : (code || '');
  }
  /** A ?bu= value (code or display name, any case) -> the unit, or null. */
  function buResolve(input) {
    const v = String(input || '').trim().toLowerCase();
    if (!v) return null;
    return units.find((u) => u.code.toLowerCase() === v) || units.find((u) => u.name.toLowerCase() === v)
      // a unit merged into another (REIT -> Malls) still opens via its old link
      || units.find((u) => (u.aliases || []).some((a) => String(a).toLowerCase() === v)) || null;
  }
  /** Short badge text for a unit ("PD" for Property Development). */
  function buInitials(code) {
    const name = buName(code);
    if (code === 'ALL') return 'ALL';
    if (/^[A-Z&]{2,4}$/.test(name)) return name;
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length > 1) return words.map((w) => w[0]).join('').toUpperCase().slice(0, 3);
    const u = units.find((x) => x.code === code);
    return (u && u.ref_code && u.ref_code.length <= 4 ? u.ref_code : name.slice(0, 3)).toUpperCase();
  }
  const BU_COLORS = ['#0369A1', '#B91016', '#7E22CE', '#0F766E', '#1D4ED8', '#C2410C', '#047857', '#9D174D', '#4338CA', '#A16207'];
  function buColor(code) {
    if (code === 'ALL' || code === 'GROUP') return '#0F172A';
    const i = units.findIndex((u) => u.code === code);
    return BU_COLORS[(i < 0 ? 0 : i) % BU_COLORS.length];
  }

  // --------------------------------------------------------------------------
  // Addresses, phone numbers, file links
  // --------------------------------------------------------------------------
  const MY_STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang',
    'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya', 'Outside Malaysia'];

  /** Address lines for 'permanent' or 'correspondence' (old one-box addresses still work). */
  function addressLines(a, kind) {
    const line1 = a[`${kind}_address`];
    const line2 = a[`${kind}_address2`];
    const place = [a[`${kind}_postcode`], a[`${kind}_city`]].filter(Boolean).join(' ');
    return [line1, line2, place, a[`${kind}_state`]].map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
  }
  function formatAddress(a, kind, sep = ', ') { return addressLines(a, kind).join(sep); }
  /** True when the correspondence address is empty or identical to the permanent one. */
  function sameAddress(a) {
    const c = formatAddress(a, 'correspondence');
    return !c || c === formatAddress(a, 'permanent');
  }

  /** Malaysian phone numbers: 10-11 digits. */
  function isValidPhone(v) { return /^\d{10,11}$/.test(String(v || '').trim()); }

  /** Uploaded files are served by the API (/api/files/...); make the link absolute when the API lives elsewhere (local dev). */
  function fileUrl(u) {
    if (!u || !/^\/api\//.test(u)) return u || '';
    try {
      const base = new URL(apiBase(), global.location.href);
      return base.origin === global.location.origin ? u : base.origin + u;
    } catch (err) { return u; }
  }

  // --------------------------------------------------------------------------
  // Supporting documents
  // --------------------------------------------------------------------------
  const DOC_SECTIONS = [
    { key: 'ic', label: 'IC copy', hint: 'Front and back of your MyKad (non-Malaysians: passport photo page)', required: true, slots: [['ic_front', 'Front'], ['ic_back', 'Back']] },
    { key: 'resume', label: 'Resume / CV', hint: 'Your latest resume', required: true },
    { key: 'academic', label: 'Academic certificates', hint: 'SPM, diploma, degree, transcripts' },
    { key: 'payslip', label: 'Payslip', hint: 'Latest 3 months, if currently employed' },
    { key: 'declaration', label: 'Declaration details', hint: 'More details for declaration (B) or (C), if the box was too short' },
    { key: 'other', label: 'Other documents', hint: 'Release letter, testimonials, etc.' },
  ];
  const DOC_CATEGORY_KEYS = ['ic_front', 'ic_back', 'resume', 'academic', 'payslip', 'declaration', 'other'];
  /** Files grouped by category; files from before sections existed count as 'other'. */
  function docsByCategory(list) {
    const out = {};
    DOC_CATEGORY_KEYS.forEach((k) => { out[k] = []; });
    (list || []).forEach((f, i) => {
      const k = DOC_CATEGORY_KEYS.includes(f.category) ? f.category : 'other';
      out[k].push({ ...f, _index: i });
    });
    return out;
  }
  const isImage = (f) => !!(f && f.type && f.type.startsWith('image/'));
  function fileBadge(f) {
    const ext = String((f && f.name) || '').split('.').pop().toUpperCase();
    return ext && ext.length <= 4 ? ext : 'FILE';
  }

  let stickerSeq = 0;
  /** The photo placeholder sticker (original illustration). */
  function photoSticker(w = 150, h = 170) {
    const id = `wst${stickerSeq += 1}`;
    return `<svg class="wct-sticker" width="${w}" height="${h}" viewBox="0 0 150 170" role="img" aria-label="Photo" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E0F2FE"/><stop offset="1" stop-color="#FEE2E2"/></linearGradient><clipPath id="${id}c"><rect x="14" y="14" width="122" height="142" rx="18"/></clipPath></defs>
<rect x="8" y="10" width="134" height="152" rx="22" fill="#fff" stroke="#E2E8F0" stroke-width="2"/>
<g clip-path="url(#${id}c)"><rect x="14" y="14" width="122" height="142" fill="url(#${id}g)"/>
<circle cx="75" cy="70" r="26" fill="#0F172A" opacity=".9"/><path d="M28 160c4-34 24-50 47-50s43 16 47 50Z" fill="#0F172A" opacity=".9"/>
<path d="M57 120l18 18 18-18" fill="none" stroke="#D7141A" stroke-width="6" stroke-linejoin="round"/></g>
<g transform="translate(104 118)"><circle r="22" fill="#D7141A" stroke="#fff" stroke-width="4"/><path d="M-10-4h4l3-4h6l3 4h4v13h-20Z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><circle cy="2.5" r="4" fill="none" stroke="#fff" stroke-width="2.4"/></g>
<path d="M28 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#FBBF24"/></svg>`;
  }

  // --------------------------------------------------------------------------
  // Digital signature (type to sign)
  //
  //   sigHtml({ id, name, nric, showNric, agreeText, agreed, nameLabel,
  //             nricLabel, title, invalid, signedAt, onChange })
  //   sigValue(id) -> { name, nric, agreed, ok }
  //
  // Typing or ticking only updates the signature block itself and any button
  // marked data-sig-gate="<id>" — it never re-renders the page. onChange(v)
  // lets the page keep its own state in step.
  // --------------------------------------------------------------------------
  const sigHandlers = {};
  const sigTimes = {};
  function nowStamp(d = new Date()) {
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function sigHtml(o) {
    const id = o.id;
    if (o.onChange) sigHandlers[id] = o.onChange; else delete sigHandlers[id];
    const showNric = o.showNric !== false && o.nric !== undefined;
    const locked = !!o.signedAt;
    const name = o.name || '';
    if (o.agreed && !sigTimes[id]) sigTimes[id] = new Date();
    const stampTime = locked ? new Date(o.signedAt) : (o.agreed ? sigTimes[id] : null);
    return `
    <div class="wct-sig${o.invalid ? ' invalid' : ''}${locked ? ' locked' : ''}" id="${id}" data-show-nric="${showNric ? 1 : 0}">
      <div class="wct-sig-top">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        <span>${e(o.title || 'Digital signature')}</span>
        <span class="wct-sig-lock"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>${locked ? 'Signed' : 'Recorded with date &amp; time'}</span>
      </div>
      ${locked ? '' : `
      <div class="wct-sig-fields${showNric ? '' : ' one'}">
        <div class="field"><label for="${id}Name">${e(o.nameLabel || 'Full name (as per NRIC / passport)')} <span class="req-star">*</span></label>
          <input type="text" id="${id}Name" value="${e(name)}" autocomplete="name" oninput="WCT.sigUpdate('${id}')"></div>
        ${showNric ? `<div class="field"><label for="${id}Nric">${e(o.nricLabel || 'NRIC / Passport no.')} <span class="req-star">*</span></label>
          <input type="text" id="${id}Nric" value="${e(o.nric || '')}" oninput="WCT.sigUpdate('${id}')"></div>` : ''}
      </div>`}
      <div class="wct-sig-pad" aria-live="polite">
        <span class="wct-sig-x" aria-hidden="true">✕</span>
        <div class="wct-sig-name" id="${id}Preview">${e(name) || '<span class="ph">Your signature appears here</span>'}</div>
        <div class="wct-sig-stamp"><span id="${id}Who">${name ? `Signed by ${e(name)}${showNric && o.nric ? ` · ${e(o.nric)}` : ''}` : ''}</span><span id="${id}When">${stampTime ? e(nowStamp(stampTime)) : ''}</span></div>
      </div>
      ${locked ? '' : `
      <label class="wct-sig-agree"><input type="checkbox" id="${id}Agree" ${o.agreed ? 'checked' : ''} onchange="WCT.sigUpdate('${id}')"> <span>${o.agreeText || 'I confirm the above information is true and correct.'}</span></label>`}
      <div class="wct-sig-done" id="${id}Done" ${(locked || (o.agreed && name)) ? '' : 'hidden'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>${locked ? `Signed digitally on ${e(nowStamp(new Date(o.signedAt)))}` : 'Signed. You can continue.'}
      </div>
    </div>`;
  }
  function sigValue(id) {
    const box = document.getElementById(id);
    if (!box) return { name: '', nric: '', agreed: false, ok: false };
    const name = (document.getElementById(`${id}Name`) || {}).value || '';
    const nricEl = document.getElementById(`${id}Nric`);
    const nric = nricEl ? nricEl.value : '';
    const agreed = !!(document.getElementById(`${id}Agree`) || {}).checked;
    const needNric = box.dataset.showNric === '1';
    return { name: name.trim(), nric: nric.trim(), agreed, ok: !!name.trim() && agreed && (!needNric || !!nric.trim()) };
  }
  function sigUpdate(id) {
    const v = sigValue(id);
    const box = document.getElementById(id);
    if (!box) return v;
    box.classList.remove('invalid');
    if (v.agreed && !sigTimes[id]) sigTimes[id] = new Date();
    if (!v.agreed) delete sigTimes[id];
    const prev = document.getElementById(`${id}Preview`);
    if (prev) prev.innerHTML = v.name ? e(v.name) : '<span class="ph">Your signature appears here</span>';
    const who = document.getElementById(`${id}Who`);
    if (who) who.textContent = v.name ? `Signed by ${v.name}${v.nric ? ` · ${v.nric}` : ''}` : '';
    const when = document.getElementById(`${id}When`);
    if (when) when.textContent = v.agreed && sigTimes[id] ? nowStamp(sigTimes[id]) : '';
    const done = document.getElementById(`${id}Done`);
    if (done) done.hidden = !v.ok;
    document.querySelectorAll(`[data-sig-gate="${id}"]`).forEach((b) => { b.disabled = !v.ok; });
    document.querySelectorAll(`[data-sig-hint="${id}"]`).forEach((h) => { h.hidden = v.ok; });
    if (sigHandlers[id]) sigHandlers[id](v);
    return v;
  }

  // --------------------------------------------------------------------------
  // Job-application PDF (printed from the browser: "Save as PDF")
  // --------------------------------------------------------------------------
  const STATUS_TEXT = {
    draft: 'Draft', submitted: 'New', under_review: 'Under review', shortlisted: 'Shortlisted', interview_scheduled: 'Interview',
    offer_sent: 'Offer sent', kiv: 'KIV', hired: 'Hired', rejected: 'Rejected', withdrawn: 'Withdrawn', blacklisted: 'Blacklisted', offboarding: 'Offboarding',
  };
  const dmy = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (v ? e(v) : '—');
  };
  const dmyTime = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return e(v);
    return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const money = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    return Number.isNaN(n) ? e(v) : `RM ${n.toLocaleString('en-MY', { maximumFractionDigits: 2 })}`;
  };

  const PDPA_TEXT = {
    EN: {
      title: 'Consent to Process Personal Data and Personal Data Protection Notice',
      body: `
    <p>This Notice is issued to you by and/or on behalf of WCT Holdings Berhad, its related companies*, affiliates and other entities within the WCT group of companies (hereinafter referred to as "WCT Group") pursuant to the Personal Data Protection Act 2010. In this notice "we", "our" and "us" refer to any of the companies within the WCT Group.</p>
    <p><strong>Source and Description of Personal Data.</strong> We have collected and/or will be collecting personal data as disclosed by / collected from you which, depending on the purpose for which you disclosed the data, may include your personal details (e.g. name, date of birth, gender, race, NRIC / passport no., marital status, nationality), your contact information as well as your educational, professional, occupational, financial, familial, medical details, biometric data and/or any other information which you may provide to us.</p>
    <p><strong>Purpose and Disclosure.</strong> Your Data is being or will be processed for the purposes for which it was disclosed by you, such as to enable us to consider entering into a contract with you, to fulfil our contractual obligations to you and/or to offer or to deliver products and/or services to you. Your Data may be disclosed to another company within the WCT Group or to our agents, representatives, professional advisors and/or consultants, third party service and/or utility providers, contractors, suppliers and/or vendors as well as to relevant governmental, municipal and/or regulatory authorities.</p>
    <p><strong>Access, Correction, Inquiry and/or Complaint.</strong> You have the right to request for access to your Data and to request to update or correct the same. Please contact the Corporate Affairs Manager at 03-78066688 or email us at pdpa@wct.my.</p>
    <p><strong>Consent and Choice.</strong> Save for Data necessary for the performance of contracts between us, you may choose whether or not to provide your Data. If you wish to withdraw or limit your consent, please complete the Withdrawal Form on our website at www.wct.com.my/pdpa.</p>
    <p><strong>Transfer of personal data to places outside Malaysia.</strong> We may transfer your Data to a place outside Malaysia and you hereby consent to the transfer.</p>`,
      confirm: 'Confirmation and consent', name: 'Name', nric: 'NRIC / Passport no.', date: 'Date of consent',
    },
    BM: {
      title: 'Mengizinkan Proses Data Peribadi dan Notis Perlindungan Data Peribadi',
      body: `
    <p>Notis ini dikeluarkan kepada anda oleh dan/atau bagi pihak WCT Holdings Berhad, syarikat-syarikat yang berkaitan*, ahli-ahli gabungan dan entiti-entiti lain dalam kumpulan syarikat WCT (selepas ini dirujuk sebagai "Kumpulan WCT") selaras dengan Akta Perlindungan Data Peribadi 2010. Dalam notis ini "kami" merujuk kepada mana-mana syarikat dalam Kumpulan WCT.</p>
    <p><strong>Sumber dan Deskripsi Data Peribadi.</strong> Kami telah mengumpul dan/atau akan mengumpul data peribadi seperti yang dizahirkan oleh/dikumpul daripada anda yang, bergantung kepada maksud yang mana anda menzahirkan data tersebut, mungkin termasuk butir-butir peribadi anda (seperti: nama, tarikh lahir, jantina, bangsa, nombor kad pengenalan/pasport, status perkahwinan, kewarganegaraan), butir-butir hubungan anda serta maklumat pendidikan, profesional, pekerjaan, kewangan, keluarga, perubatan, data biometrik anda dan/atau apa-apa maklumat lain yang anda maklumkan kepada kami.</p>
    <p><strong>Maksud dan Penzahiran.</strong> Data anda sedang atau akan diproses untuk maksud-maksud yang mana ia telah dizahirkan oleh anda, seperti membolehkan kami membuat pertimbangan untuk memasuki kontrak dengan anda, untuk memenuhi obligasi-obligasi kontrak kami kepada anda dan/atau untuk menawarkan atau membekalkan produk dan/atau perkhidmatan kami kepada anda. Data anda mungkin akan dizahirkan kepada syarikat lain di dalam Kumpulan WCT atau ejen-ejen, wakil-wakil, penasihat-penasihat profesional dan/atau perunding-perunding kami, pemberi perkhidmatan pihak ketiga dan/atau pembekal utiliti, kontraktor, pembekal dan/atau penjual dan juga kepada pihak-pihak berkuasa kerajaan, tempatan, pengawal yang berkaitan.</p>
    <p><strong>Akses, Pembetulan, Siasatan dan/atau Aduan.</strong> Anda berhak untuk meminta akses kepada Data anda dan untuk meminta untuk mengemaskini atau membetulkan Data anda. Sila hubungi Pengurus Hal Ehwal Korporat di 03-7806688 atau menghantar e-mel kepada pdpa@wct.my.</p>
    <p><strong>Persetujuan dan Pilihan anda.</strong> Kecuali untuk Data yang perlu bagi kami melaksanakan kontrak antara kami, anda boleh memilih sama ada untuk memberi atau enggan memberi Data anda. Jika anda ingin menarik balik atau menghadkan kebenaran anda, sila melengkapkan Borang Penarikan Balik di laman web kami di www.wct.com.my/pdpa.</p>
    <p><strong>Pemindahan data peribadi ke tempat di luar Malaysia.</strong> Kami boleh memindahkan Data anda ke tempat di luar Malaysia dan dengan ini anda telahpun bersetuju terhadap pemindahan tersebut.</p>`,
      confirm: 'Pengesahan dan persetujuan', name: 'Nama', nric: 'No. K/P / Pasport', date: 'Tarikh persetujuan',
    },
  };
  const PDPA_ENTITIES = '*WCT Holdings Berhad, WCT Berhad, WCT Equity Sdn Bhd, KKKBWCT Joint Venture Sdn Bhd, WCT Overseas Sdn Bhd, WCT Group Sdn Bhd, WCT TSR Sdn Bhd, WCT Construction Sdn Bhd, WCT International Sdn Bhd, Intraxis Engineering Sdn Bhd, WCT Machinery Sdn Bhd, WCT Products Sdn Bhd, W Facade Sdn Bhd, WCT Land Sdn Bhd, WCT Assets Sdn Bhd, WCT Acres Sdn Bhd, Gabungan Efektif Sdn Bhd, WCT Properties Sdn Bhd, Gemilang Waras Sdn Bhd, and other related WCT Group entities.';

  // Education type as shown ('School' is stored for secondary school).
  const EDU_TYPE_LABELS = { 'Primary School': 'Primary School', School: 'Secondary School', 'College/University': 'College / University', 'Professional Body': 'Professional Body' };
  const eduTypeLabel = (t) => EDU_TYPE_LABELS[t] || t || '';
  // Declarations (B)/(C) read like the manual form: NONE, or the details.
  const declAnswer = (v, spec) => (v === 'No' ? 'NONE' : v === 'Yes' ? (spec || 'Declared') : '');

  const DECLARATION_A = 'I declare that the statements made by me to the foregoing questions are true, complete and correct to the best of my knowledge and belief. Permission is given to the Company to make such investigations as and when necessary on the information given above. I understand that my misrepresentation or material omission made herein or on any other documents requested by the Company, will render dismissal or termination of my employment with the Company.';
  const DECLARATION_B = 'I declare that save and except for the following I am not involved in, a party to nor the subject of any law suits, arbitral proceedings, disciplinary proceedings, criminal inquiry, investigation and/or conviction and/or any other legal or quasi-legal proceedings.';
  const DECLARATION_C = 'I declare that save and except for the following I am not aware of any matter or information that may affect my personal and/or professional public standing or repute or that might adversely affect your consideration of my application for employment.';

  function pdfStyles() {
    return `
  @page{size:A4;margin:14mm 14mm 16mm;}
  *{box-sizing:border-box;}
  body{font-family:'Source Sans 3',Arial,sans-serif;font-size:11.5px;color:#111827;margin:0;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{position:relative;max-width:794px;margin:0 auto;padding:6px 0 30px;}
  .page + .page{page-break-before:always;break-before:page;}
  .head{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;padding-bottom:12px;border-bottom:3px solid #D7141A;}
  .head img.logo{width:92px;height:auto;}
  .head .co{font:700 18px 'Lexend',Arial,sans-serif;color:#0F172A;}
  .head .doc{font:600 10px 'Source Sans 3',Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#475569;margin-top:2px;}
  .head .conf{font-size:9.5px;color:#64748B;margin-top:4px;}
  .photo{width:88px;height:112px;border:1px solid #CBD5E1;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#F8FAFC;}
  .photo img{width:100%;height:100%;object-fit:cover;}
  .meta{display:grid;grid-template-columns:repeat(4,1fr);background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;margin:12px 0 14px;}
  .meta > div{padding:7px 11px;border-right:1px solid #E2E8F0;}
  .meta > div:last-child{border-right:0;}
  .k{font:600 8px 'Source Sans 3',Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#64748B;}
  .meta .v{font:700 11.5px 'Lexend',Arial,sans-serif;color:#0F172A;margin-top:1px;}
  .sec{margin-bottom:12px;break-inside:avoid;page-break-inside:avoid;}
  .sec.flow{break-inside:auto;page-break-inside:auto;}
  h3{font:700 10.5px 'Lexend',Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#0F172A;display:flex;align-items:center;gap:8px;margin:0 0 6px;}
  h3 .n{width:19px;height:19px;border-radius:4px;background:#0F172A;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9.5px;letter-spacing:0;}
  h3::after{content:"";flex:1;height:1px;background:#CBD5E1;}
  .grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #E2E8F0;border-radius:4px;}
  .grid > div{padding:5px 10px;border-bottom:1px solid #EEF2F6;}
  .grid > div:nth-child(odd){border-right:1px solid #EEF2F6;}
  .grid > div.full{grid-column:1/-1;border-right:0;}
  .grid .v{font-size:11.5px;}
  table.t{width:100%;border-collapse:collapse;border:1px solid #E2E8F0;}
  table.t th{background:#F1F5F9;font:600 8.5px 'Source Sans 3',Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#475569;text-align:left;padding:5px 8px;}
  table.t td{padding:5px 8px;border-top:1px solid #EEF2F6;font-size:11px;vertical-align:top;}
  table.t td.muted{color:#64748B;font-style:italic;}
  .note{border:1px solid #E2E8F0;border-radius:4px;padding:7px 10px;font-size:11px;}
  .decl{border:1px solid #E2E8F0;border-radius:4px;padding:7px 10px;font-size:10.5px;line-height:1.45;margin-bottom:6px;}
  .decl b{font-weight:700;}
  .decl .ans{float:right;font:700 9.5px 'Source Sans 3',Arial,sans-serif;border:1px solid #94A3B8;border-radius:3px;padding:0 7px;margin:0 0 4px 10px;}
  .decl .spec{margin-top:4px;color:#334155;}
  .sig{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-top:10px;border:1px solid #E2E8F0;border-radius:4px;padding:10px 14px;}
  .sig .name{font:600 30px 'Caveat','Segoe Script','Brush Script MT',cursive;color:#1E3A8A;border-bottom:1px solid #94A3B8;padding:0 6px;line-height:1.2;min-height:38px;}
  .sig .who{font-size:10px;color:#475569;margin-top:4px;}
  .sig .when{font-size:10.5px;color:#334155;align-self:end;}
  .files{columns:2;column-gap:18px;font-size:11px;}
  .files div{break-inside:avoid;padding:2px 0;}
  /* The table's footer row repeats on every printed page and keeps the page
     content clear of the fixed footer line below. */
  table.pw{width:100%;border-collapse:collapse;}
  table.pw > tbody > tr > td, table.pw > tfoot > tr > td{padding:0;border:0;}
  .pw-space{height:24px;}
  .foot{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:space-between;font-size:8.5px;color:#64748B;border-top:1px solid #E2E8F0;padding-top:4px;background:#fff;}
  .ic{display:grid;gap:18px;margin-top:18px;}
  .ic .slot{border:1px dashed #94A3B8;border-radius:8px;padding:12px;text-align:center;}
  .ic .slot .lbl{font:700 10.5px 'Lexend',Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px;}
  .ic .slot img{max-width:100%;max-height:118mm;border-radius:6px;border:1px solid #CBD5E1;}
  .ic .slot .missing{color:#64748B;padding:30px 0;}
  .legal p{margin:0 0 9px;font-size:10.6px;text-align:justify;}
  .small{font-size:7.5px;color:#64748B;line-height:1.5;margin-top:12px;}
  .bar{background:#FFF7D6;border-bottom:2px solid #E0C34C;padding:10px 16px;margin:-8px -8px 14px;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:12px;}
  .bar button{font:700 13px 'Source Sans 3',Arial,sans-serif;padding:8px 18px;border-radius:8px;border:0;cursor:pointer;background:#0F172A;color:#fff;}
  @media print{.bar{display:none;}}`;
  }

  /**
   * Full printable HTML for an application row. Options:
   *   statusLabel   text for the status box (default from the status code)
   *   hideStatus    leave the status out (the candidate's own copy)
   *   includePdpa   add the PDPA consent page (default: when consent recorded)
   *   onboarding    the onboarding record, for family details on older records
   */
  function applicationPdfHtml(a, opts = {}) {
    const ob = opts.onboarding || {};
    const pick = (k) => {
      const v = a[k];
      const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
      return empty && ob[k] !== undefined ? ob[k] : v;
    };
    const docs = docsByCategory(a.attachments);
    const status = opts.statusLabel || STATUS_TEXT[a.status] || a.status || '';
    const head = (title, sub, withPhoto) => `
      <div class="head">
        <img class="logo" src="${logoUri()}" alt="WCT">
        <div><div class="co">${title}</div><div class="doc">${sub}</div><div class="conf">Private &amp; confidential · Prepared for HR use only</div></div>
        ${withPhoto ? `<div class="photo">${a.profile_picture_url ? `<img src="${e(fileUrl(a.profile_picture_url))}" alt="">` : photoSticker(72, 82)}</div>` : '<div></div>'}
      </div>`;
    const cell = (k, v, full) => `<div${full ? ' class="full"' : ''}><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const row = (cols, emptyText, span) => cols || `<tr><td colspan="${span}" class="muted">${emptyText}</td></tr>`;

    const langs = (a.language_ability || []).filter((l) => l && l.language && !/^Others \(please state\)$/i.test(l.language));
    const edu = a.education || [];
    const exp = (a.working_experience || []).filter((w) => w && (w.employer || w.position));
    const kidsA = pick('children_below_18') || [];
    const kidsB = pick('children_18_to_23') || [];
    const spouse = pick('spouse_name');
    const count = (k, list) => { const v = pick(k); return v != null && v !== '' ? Number(v) : (list.length ? list.length : null); };
    const nBelow = count('children_below_18_count', kidsA);
    const nAbove = count('children_18_to_23_count', kidsB);
    const refs = [a.referee1, a.referee2].filter((r) => r && r.name);
    let n = 0;
    const sec = (title, inner, flow) => `<div class="sec${flow ? ' flow' : ''}"><h3><span class="n">${n += 1}</span>${title}</h3>${inner}</div>`;
    const yn = (v, spec) => (v === 'Yes' ? `Yes${spec ? ` — ${e(spec)}` : ''}` : dash(v));
    const corr = sameAddress(a) ? 'Same as permanent address' : dash(formatAddress(a, 'correspondence'));
    const signedName = a.pdpa_agreed_name || a.name_nric || '';

    const page1 = `
    <div class="page">
      ${head('WCT Group of Companies', 'Employment Application Form', true)}
      <div class="meta">
        <div><div class="k">Reference no.</div><div class="v">${dash(a.reference_no)}</div></div>
        <div><div class="k">Business unit</div><div class="v">${dash(buName(a.business_unit))}</div></div>
        <div><div class="k">Submitted</div><div class="v">${dmyTime(a.submitted_at)}</div></div>
        ${opts.hideStatus ? `<div><div class="k">Position</div><div class="v">${dash(a.position_applying)}</div></div>` : `<div><div class="k">Status</div><div class="v">${dash(status)}</div></div>`}
      </div>
      ${sec('Personal particulars', `<div class="grid">
        ${cell('Position applying for', dash(a.position_applying))}${cell('Name (per NRIC / passport)', dash(a.name_nric))}
        ${cell('NRIC / Passport no.', dash(a.nric_new || a.passport_number))}${cell('Alias', dash(a.alias))}
        ${cell('Date of birth / Age', `${dmy(a.date_of_birth)} / ${dash(a.age)}`)}${cell('Place of birth', dash(a.place_of_birth))}
        ${cell('Citizenship / Marital status', `${dash(a.citizen)} / ${dash(a.marital_status)}`)}${cell('Bumiputra / Race', `${dash(a.bumiputra)} / ${dash(a.race)}`)}
        ${cell('Mobile', dash(a.mobile_phone))}${cell('Email', dash(a.email))}
        ${cell('Tel. (residence / office)', `${dash(a.tel_residence)} / ${dash(a.tel_office)}`, true)}
        ${cell('Permanent address', dash(formatAddress(a, 'permanent')), true)}
        ${cell('Correspondence address', corr, true)}
      </div>`)}
      ${sec('Language ability', `<table class="t"><thead><tr><th>Language / dialect</th><th>Spoken</th><th>Written</th></tr></thead><tbody>
        ${row(langs.map((l) => `<tr><td>${e(l.language)}</td><td>${dash(l.spoken)}</td><td>${dash(l.written)}</td></tr>`).join(''), 'None provided', 3)}</tbody></table>`)}
      ${sec('Education', `<table class="t"><thead><tr><th>Type</th><th>Institution</th><th>Period</th><th>Qualification</th><th>Course</th></tr></thead><tbody>
        ${row(edu.map((r) => `<tr><td>${dash(eduTypeLabel(r.type))}</td><td>${dash(r.name)}</td><td>${dash(r.from_year)} – ${dash(r.to_year)}</td><td>${dash(r.qualification)}</td><td>${dash(r.course_name)}</td></tr>`).join(''), 'None provided', 5)}</tbody></table>`)}
      ${sec('Working experience', a.no_working_experience && !exp.length
        ? '<div class="note">No previous working experience (declared by the candidate).</div>'
        : `<table class="t"><thead><tr><th>Employer</th><th>Last position</th><th>Period</th><th>Last drawn (RM)</th></tr></thead><tbody>
        ${row(exp.map((w) => `<tr><td>${dash(w.employer)}</td><td>${dash(w.position)}</td><td>${dash(w.from)} – ${w.is_current ? 'Present' : dash(w.to)}</td><td>${dash(w.remuneration)}</td></tr>
          ${w.responsibilities ? `<tr><td colspan="4" style="color:#475569;padding-top:0;"><span class="k">Responsibilities</span> ${e(w.responsibilities)}</td></tr>` : ''}`).join(''), 'None provided', 4)}</tbody></table>`, true)}
      ${sec('Employment details', `<div class="grid">
        ${cell('Resignation notice required / Notice period', `${dash(a.resignation_notice_required)} / ${dash(a.notice_period)}`)}${cell('Expected basic salary', money(a.expected_basic_salary))}
        ${cell('Available to start', dmy(a.date_available_to_start))}${cell('Own transport (car / motorcycle)', `${dash(a.own_transport_motorcar)} / ${dash(a.own_transport_motorcycle)}`)}
        ${cell('Willing to be based outside Klang Valley', dash(a.willing_based_outside_klang_valley))}${cell('Relatives / friends in the company', yn(a.relatives_in_company, a.relatives_in_company === 'Yes' ? `${a.relatives_name || ''} (${a.relatives_relationship || ''})` : ''))}
        ${cell('Referred by anyone', yn(a.referral_person, a.referral_person === 'Yes' ? `${a.referral_name || ''}, ${a.referral_department || ''}` : ''))}${cell('Physical defects / disabilities', yn(a.physical_defects, a.physical_defects_specify))}
        ${cell('Arrested / convicted', yn(a.arrested_convicted, a.arrested_convicted_specify), true)}
      </div>`)}
      ${(spouse || kidsA.length || kidsB.length || nBelow != null || nAbove != null) ? sec('Family details', `
        <div class="grid"${(kidsA.length || kidsB.length) ? ' style="margin-bottom:6px"' : ''}>
          ${spouse ? `${cell('Spouse name', dash(spouse))}${cell('Spouse occupation', dash(pick('spouse_occupation')))}${cell('Spouse working', dash(pick('spouse_working')))}` : ''}
          ${cell('Children below 18', nBelow == null ? '—' : String(nBelow))}${cell('Children 18 and above', nAbove == null ? '—' : String(nAbove))}
        </div>
        ${(kidsA.length || kidsB.length) ? `<table class="t"><thead><tr><th>Child</th><th>Age group</th><th>Gender</th><th>NRIC</th><th>Date of birth</th><th>Education</th></tr></thead><tbody>
          ${kidsA.map((c) => `<tr><td>${dash(c.name)}</td><td>Below 18</td><td>${dash(c.gender)}</td><td>${dash(c.nric)}</td><td>${dmy(c.date_of_birth)}</td><td>${dash(c.course_name)}</td></tr>`).join('')}
          ${kidsB.map((c) => `<tr><td>${dash(c.name)}</td><td>18 and above</td><td>${dash(c.gender)}</td><td>${dash(c.nric)}</td><td>${dmy(c.date_of_birth)}</td><td>${dash(c.course_name)}</td></tr>`).join('')}
        </tbody></table>` : ''}`) : ''}
      ${sec('Referees', a.no_referees ? '<div class="note">No referee provided (declared by the candidate).</div>' : `<table class="t"><thead><tr><th></th><th>Name</th><th>Designation</th><th>Company</th><th>Relationship</th><th>Contact</th></tr></thead><tbody>
        ${row(refs.map((r, i) => `<tr><td>${i + 1}</td><td>${dash(r.name)}</td><td>${dash(r.designation)}</td><td>${dash(r.company)}</td><td>${dash(r.relationship)}</td><td>${dash(r.contact)}</td></tr>`).join(''), 'None provided', 6)}</tbody></table>`)}
      ${sec('Declarations', `
        <div class="decl"><span class="ans">${a.submitted_at ? 'Agreed' : '—'}</span><b>(A) ${e(DECLARATION_A)}</b></div>
        <div class="decl"><b>(B) ${e(DECLARATION_B)}</b><div class="spec">${dash(declAnswer(a.declaration_lawsuit, a.declaration_lawsuit_specify))}</div></div>
        <div class="decl"><b>(C) ${e(DECLARATION_C)}</b><div class="spec">${dash(declAnswer(a.declaration_other_matters, a.declaration_other_matters_specify))}</div></div>
        <div class="sig"><div><div class="k">Candidate's digital signature</div><div class="name">${e(signedName)}</div><div class="who">${dash(signedName)} · ${dash(a.pdpa_agreed_nric || a.nric_new || a.passport_number)}</div></div>
          <div class="when">${a.pdpa_agreed_at ? `Signed electronically on ${dmyTime(a.pdpa_agreed_at)} (MYT) through the WCT Employment Application Portal. PDPA notice read in ${a.language_choice === 'BM' ? 'Bahasa Melayu' : 'English'}.` : 'Not yet signed.'}</div></div>`)}
      ${sec('Supporting documents', `<div class="files">
        ${DOC_SECTIONS.map((s) => {
          const files = s.slots ? s.slots.flatMap(([k]) => docs[k]) : docs[s.key];
          return `<div><b>${e(s.label)}:</b> ${files.length ? files.map((f) => e(f.name)).join(', ') : '<span style="color:#64748B">none</span>'}</div>`;
        }).join('')}
      </div>`)}
    </div>`;

    const icImgs = [['ic_front', 'Front'], ['ic_back', 'Back']].map(([k, label]) => [label, docs[k].find(isImage), docs[k][0]]);
    const icPage = icImgs.some(([, img]) => img) ? `
    <div class="page">
      ${head('Supporting document', 'Identity card copy (front &amp; back)', false)}
      <div class="ic">${icImgs.map(([label, img, any]) => `<div class="slot"><div class="lbl">${label}</div>${img ? `<img src="${e(fileUrl(img.url))}" alt="IC ${label.toLowerCase()}">`
        : `<div class="missing">${any ? `Uploaded as a file: ${e(any.name)}` : 'Not uploaded'}</div>`}</div>`).join('')}</div>
    </div>` : '';

    const includePdpa = opts.includePdpa !== undefined ? opts.includePdpa : !!a.pdpa_agreed;
    const t = PDPA_TEXT[a.language_choice === 'BM' ? 'BM' : 'EN'];
    const pdpaPage = includePdpa ? `
    <div class="page">
      ${head(t.title, 'Personal Data Protection Act 2010', false)}
      <div class="legal" style="margin-top:14px">${t.body}</div>
      <div class="sig"><div><div class="k">${e(t.confirm)} · recorded digitally</div><div class="name">${e(a.pdpa_agreed_name || '')}</div>
        <div class="who">${e(t.name)}: ${dash(a.pdpa_agreed_name)} · ${e(t.nric)}: ${dash(a.pdpa_agreed_nric)}</div></div>
        <div class="when">${e(t.date)}: ${dmyTime(a.pdpa_agreed_at)}</div></div>
      <div class="small">${e(PDPA_ENTITIES)}</div>
    </div>` : '';

    const pages = 1 + (icPage ? 1 : 0) + (pdpaPage ? 1 : 0);
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${e(a.reference_no || 'Application')} — WCT Group</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Lexend:wght@600;700&family=Source+Sans+3:wght@400;600;700&family=Caveat:wght@600&display=swap" rel="stylesheet">
<style>${pdfStyles()}</style></head><body>
<div class="bar"><span>Ready: use your browser's print dialog and choose "Save as PDF" (${pages} page${pages > 1 ? 's' : ''}).</span><button onclick="window.print()">Print / Save as PDF</button></div>
<table class="pw"><tfoot><tr><td><div class="pw-space"></div></td></tr></tfoot><tbody><tr><td>${page1}${icPage}${pdpaPage}</td></tr></tbody></table>
<div class="foot"><span>${e(a.reference_no || '')} · ${e(a.name_nric || '')}</span><span>WCT Employment Application Portal · generated ${dmyTime(new Date().toISOString())}</span></div>
</body></html>`;
  }

  /**
   * Printable onboarding record, in the same layout as the application PDF:
   * page 1 Employee Personal Details, page 2 Salary Crediting Requisition.
   *   a  the application row (name, reference, photo, unit, position)
   *   o  the onboarding record, with spouse/children already merged in
   */
  function onboardingPdfHtml(a, o) {
    a = a || {}; o = o || {};
    const head = (title, sub, withPhoto) => `
      <div class="head">
        <img class="logo" src="${logoUri()}" alt="WCT">
        <div><div class="co">${title}</div><div class="doc">${sub}</div><div class="conf">Private &amp; confidential · Prepared for HR use only</div></div>
        ${withPhoto ? `<div class="photo">${a.profile_picture_url ? `<img src="${e(fileUrl(a.profile_picture_url))}" alt="">` : photoSticker(72, 82)}</div>` : '<div></div>'}
      </div>`;
    const meta = `
      <div class="meta">
        <div><div class="k">Employee</div><div class="v">${dash(a.name_nric)}</div></div>
        <div><div class="k">Reference no.</div><div class="v">${dash(a.reference_no)}</div></div>
        <div><div class="k">Business unit</div><div class="v">${dash(buName(a.business_unit))}</div></div>
        <div><div class="k">Position</div><div class="v">${dash(a.position_applying)}</div></div>
      </div>`;
    const cell = (k, v, full) => `<div${full ? ' class="full"' : ''}><div class="k">${k}</div><div class="v">${v}</div></div>`;
    let n = 0;
    const sec = (title, inner) => `<div class="sec"><h3><span class="n">${n += 1}</span>${title}</h3>${inner}</div>`;
    const sig = (signed, name, at, what) => `
      <div class="sig"><div><div class="k">Employee's digital signature</div><div class="name">${e(signed ? (name || a.name_nric || '') : '')}</div>
        <div class="who">${dash(name || a.name_nric)} · ${dash(a.nric_new || a.passport_number)}</div></div>
        <div class="when">${signed ? `${what} confirmed electronically on ${dmyTime(at)} (MYT) through the WCT Employment Application Portal.` : 'Not yet confirmed by the employee.'}</div></div>`;

    const kids = [...(o.children_below_18 || []).map((c) => ['Below 18', c]), ...(o.children_18_to_23 || []).map((c) => ['18–23, full-time student', c])];
    const contacts = o.emergency_contacts || [];

    const page1 = `
    <div class="page">
      ${head('Employee Personal Details', 'Onboarding · Personal details form', true)}
      ${meta}
      ${sec('Statutory details', `<div class="grid">
        ${cell('EPF no.', dash(o.epf_no))}${cell('SOCSO no.', dash(o.socso_no))}
        ${cell('Income tax file no.', dash(o.income_tax_no))}${cell('Income tax branch', dash(o.tax_branch))}
        ${cell('Bank account no.', dash(o.bank_account_no))}${cell('CIDB green card no. / branch', `${dash(o.cidb_green_card_no)} / ${dash(o.cidb_branch)}`)}
      </div>`)}
      ${sec('Spouse &amp; children', (o.spouse_name || kids.length) ? `${o.spouse_name ? `<div class="grid"${kids.length ? ' style="margin-bottom:6px"' : ''}>
        ${cell('Spouse name', dash(o.spouse_name))}${cell('Spouse occupation', dash(o.spouse_occupation))}
        ${cell('Spouse working', dash(o.spouse_working))}
      </div>` : ''}${kids.length ? `<table class="t"><thead><tr><th>Name</th><th>Age group</th><th>Gender</th><th>NRIC</th><th>Date of birth</th><th>Education</th><th>Child tax relief</th></tr></thead><tbody>
        ${kids.map(([g, c]) => `<tr><td>${dash(c.name)}</td><td>${g}</td><td>${dash(c.gender)}</td><td>${dash(c.nric)}</td><td>${dmy(c.date_of_birth)}</td><td>${dash(c.course_name)}</td><td>${c.tax_relief ? 'Yes' : 'No'}</td></tr>`).join('')}
      </tbody></table>` : ''}` : '<div class="note">No spouse or children declared.</div>')}
      ${sec('Emergency contacts', `<table class="t"><thead><tr><th>Name (per NRIC)</th><th>Relationship</th><th>Home / mobile no.</th></tr></thead><tbody>
        ${contacts.length ? contacts.map((c) => `<tr><td>${dash(c.name)}</td><td>${dash(c.relationship)}</td><td>${dash(c.contact)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">None provided</td></tr>'}
      </tbody></table>`)}
      ${sec('Beneficiary (next of kin)', `<div class="grid">
        ${cell('Name', dash(o.beneficiary_name))}${cell('Relationship', dash(o.beneficiary_relationship))}
        ${cell('Contact no.', dash(o.beneficiary_contact), true)}
      </div>`)}
      ${sec('Confirmation', sig(o.personal_details_confirmed, o.personal_details_signed_name, o.personal_details_confirmed_at, 'Personal details'))}
    </div>`;

    n = 0;
    const page2 = `
    <div class="page">
      ${head('Salary Crediting Requisition', 'Onboarding · Salary crediting form', false)}
      ${meta}
      ${sec('Addressed to', `<div class="note">Human Resources Department, <b>${dash(o.salary_company)}</b></div>`)}
      ${sec('Account for salary crediting', `<div class="grid">
        ${cell('Employee name', dash(a.name_nric))}${cell('IC / passport no. submitted', dash(o.salary_ic_submitted || a.nric_new || a.passport_number))}
        ${cell('Bank', dash(o.salary_bank))}${cell('Branch', dash(o.salary_branch))}
        ${cell('Account no.', dash(o.salary_account_no), true)}
      </div>`)}
      ${sec('Declaration', `
        <div class="decl"><b>I hereby agree that my salary is to be paid through the bank account above. I confirm that the information herein is correct and in order. Should there be any discrepancy in the information, which may lead to a delay or inability to credit my salary, it is my sole responsibility.</b></div>
        <div class="decl"><i>Saya bersetuju gaji saya dibayar melalui akaun bank di atas. Saya mengesahkan maklumat tersebut di atas adalah betul dan teratur. Sebarang perbezaan dalam maklumat tersebut, yang mungkin mengakibatkan kelewatan ataupun ketidakmasukan gaji, adalah tanggungjawab saya sendiri.</i></div>
        ${sig(o.salary_crediting_confirmed, o.salary_crediting_signed_name, o.salary_crediting_confirmed_at, 'Salary crediting details')}`)}
    </div>`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${e(a.reference_no || 'Onboarding')} — Onboarding — WCT Group</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Lexend:wght@600;700&family=Source+Sans+3:wght@400;600;700&family=Caveat:wght@600&display=swap" rel="stylesheet">
<style>${pdfStyles()}</style></head><body>
<div class="bar"><span>Ready: use your browser's print dialog and choose "Save as PDF" (2 pages).</span><button onclick="window.print()">Print / Save as PDF</button></div>
<table class="pw"><tfoot><tr><td><div class="pw-space"></div></td></tr></tfoot><tbody><tr><td>${page1}${page2}</td></tr></tbody></table>
<div class="foot"><span>${e(a.reference_no || '')} · ${e(a.name_nric || '')} · Onboarding</span><span>WCT Employment Application Portal · generated ${dmyTime(new Date().toISOString())}</span></div>
</body></html>`;
  }

  /** Open printable HTML in a new tab and start printing once fonts/images load. */
  function openPrint(html) {
    const win = global.open('', '_blank');
    if (!win) { global.alert('Please allow pop-ups for this site to generate the PDF.'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
  }

  global.WCT = {
    esc: e, loadBusinessUnits, setBusinessUnits, businessUnits, buName, buResolve, buInitials, buColor,
    MY_STATES, addressLines, formatAddress, sameAddress, isValidPhone, fileUrl,
    DOC_SECTIONS, docsByCategory, isImage, fileBadge, photoSticker,
    sigHtml, sigValue, sigUpdate,
    STATUS_TEXT, DECLARATION_A, DECLARATION_B, DECLARATION_C, eduTypeLabel, declAnswer, applicationPdfHtml, onboardingPdfHtml, openPrint,
  };
}(window));
