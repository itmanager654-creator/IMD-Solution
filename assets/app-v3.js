/* =====================================================
   INTRAMED SOLUTION — shared app.js
   Used by every page (index, gastroenterology, cardiology,
   vascular, contact). Detects the current page via
   document.body.dataset.page and renders only what that
   page needs. Firebase Firestore stays the single source
   of truth so the existing Admin Dashboard (index.html only)
   keeps editing content live for every page.
===================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAnalytics, logEvent
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot,
  collection, addDoc, serverTimestamp, query, orderBy, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---- Firebase project config ----
const firebaseConfig = {
  apiKey: "AIzaSyBSTed6jriA6StmbhJ6zo9Bn-Z1Kp96dqY",
  authDomain: "imdf-a8fee.firebaseapp.com",
  projectId: "imdf-a8fee",
  storageBucket: "imdf-a8fee.firebasestorage.app",
  messagingSenderId: "480524572212",
  appId: "1:480524572212:web:143e45079001605a369c61",
  measurementId: "G-Y3Y4V4WTWQ"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);
const INQUIRIES_COL = collection(db, "inquiries");

setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});

const CONTENT_DOC = doc(db, "intramed", "content");
const VISITORS_COL = collection(db, "visitors");
const ADMIN_EMAIL = "naeemjan999@intramedsolution.com";
let isAdmin = false;

// Which page are we on? Set via <body data-page="...">
const PAGE = document.body.dataset.page || "home";
// Maps a category page to the exact category string stored on each catalog row
const CATEGORY_BY_PAGE = {
  gastroenterology: "Gastroenterology",
  cardiology: "Cardiology",
  vascular: "Vascular"
};

/* ---------------- COMMON: header / nav / theme (every page) ---------------- */
const hamburgerBtn = document.getElementById('hamburgerBtn');
const mobileNav = document.getElementById('mobileNav');
if (hamburgerBtn && mobileNav) {
  hamburgerBtn.addEventListener('click', () => mobileNav.classList.toggle('open'));
  document.querySelectorAll('.mobile-nav a').forEach(a => {
    a.addEventListener('click', () => mobileNav.classList.remove('open'));
  });
}

const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
  });
}

const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => io.observe(el));
}

/* ---------------- DEFAULT DATA ---------------- */
const DEFAULT_DATA = {
  hero: {
    eyebrow: "Disposable Surgical, Gastroenterology, Cardiology & Vascular Devices",
    tagline: "A professional supplier of disposable surgical, gastroenterology, cardiology and vascular medical devices, delivering sterile, reliable instruments to hospitals and clinics across Pakistan.",
    stat1Num: "16+", stat1Label: "Device Types Supplied",
    stat2Num: "3", stat2Label: "Core Specialities",
    stat3Num: "100%", stat3Label: "Sterile & Disposable"
  },
  about: {
    title: "A trusted partner in disposable medical devices",
    subtitle: "INTRAMED SOLUTION is a Lahore-based distributor of high-quality, single-use medical devices, built to support hospitals and clinics with dependable, sterile products they can rely on every day.",
    points: [
      "Serving hospitals and clinics across Pakistan with a focus on gastroenterology, cardiology and peripheral vascular disposables.",
      "Every product is chosen for consistent quality, sterility, and clinical performance, not just cost.",
      "Committed to patient care by making sure the right device reaches the right procedure, on time."
    ]
  },
  vision: "To become Pakistan's leading provider of innovative and reliable medical devices, improving patient outcomes by making advanced disposable technology accessible to every hospital and clinic in the country.",
  mission: "To provide affordable, high-quality, sterile disposable medical products, backed by on-time delivery and attentive service, so healthcare providers can focus on what matters most: patient care.",
  categories: [
    { title: "Gastroenterology Devices", desc: "Guide wires, sphincterotomes, biopsy forceps and PEG feeding sets for endoscopic and ERCP procedures.", link: "/gastroenterology-devices/" },
    { title: "Cardiology Devices", desc: "Disposable cardiology devices for cath-lab and interventional cardiac procedures across Pakistan.", link: "/cardiology-devices/" },
    { title: "Vascular Devices", desc: "Peripheral vascular disposables supporting interventional and vascular access procedures.", link: "/vascular-devices/" }
  ],
  catalog: [
    { name: "Disposable Hydrophilic ERCP Guide Wire", spec: '0.035" x 450cm', category: "Gastroenterology" },
    { name: "Disposable Hemostatic Clips, Rotatable", spec: "2350mm, Opening 15mm", category: "Gastroenterology" },
    { name: "Disposable Injector Needle", spec: "21G & 23G, Length 2300mm", category: "Gastroenterology" },
    { name: "Disposable Grasping Forceps (Net Type) for Gastroscopy", spec: "Dia 2.4mm / 1.8mm, Length 1800mm / 1600mm", category: "Gastroenterology" },
    { name: "Disposable Grasping Forceps (Rat Tooth with Alligator Jaw)", spec: "Dia 1.8mm / 2.4mm, Length 1600mm / 2300mm", category: "Gastroenterology" },
    { name: "Disposable Biopsy Forceps", spec: "Dia 1.8mm / 2.4mm, Length 1200\u20132300mm, Standard & Oval Cup", category: "Gastroenterology" },
    { name: "Disposable Sphincterotome (Arch Shaped, Type G)", spec: "Wire Length 25mm (+5), Helical Lumen", category: "Gastroenterology" },
    { name: "Needle Knife (Needle Shaped, Type Z)", spec: "Wire Length 10mm (+2), Dia 2.5mm", category: "Gastroenterology" },
    { name: "Disposable Biliary Balloon Dilator (CRE, 3-Stage)", spec: "Balloon Dia 6-7-8mm / 10-11-12mm, Catheter 6.3 Fr", category: "Gastroenterology" },
    { name: "Disposable Stone Retrieval Balloon Catheter", spec: "Working Length 2000mm, Balloon 15\u201318mm", category: "Gastroenterology" },
    { name: "PEG Set Luxury", spec: "24 Fr, Complete Set", category: "Gastroenterology" },
    { name: "PEG Set Luxury", spec: "20 Fr, Complete Set", category: "Gastroenterology" },
    { name: "PEG Set Standard", spec: "24 Fr, Complete Set", category: "Gastroenterology" },
    { name: "PEG Set Standard", spec: "24 Fr, Complete Set (Alternate Configuration)", category: "Gastroenterology" },
    { name: "Disposable Hot Polypectomy Snare", spec: "Standard Loop, Multiple Sizes", category: "Gastroenterology" },
    { name: "Disposable Double Ended Cleaning Brush", spec: "Diameter 2mm / 6mm, Length 2300mm", category: "Gastroenterology" }
  ],
  featured: [
    { tag: "Gastrology Devices", title: "Advanced ERCP Guide Wire", desc: "Sterile, disposable hydrophilic guide wire built for smooth ERCP navigation, giving clinicians precise, confident control during the procedure." },
    { tag: "Biopsy & Sampling", title: "Precision Biopsy Forceps", desc: "Disposable biopsy forceps engineered for accurate, consistent tissue sampling during endoscopy, reducing risk of cross-contamination." },
    { tag: "PEG Feeding Sets", title: "Luxury PEG Feeding Set", desc: "Complete 24FR PEG set designed for safe, comfortable, long-term enteral feeding with reliable, easy placement." }
  ],
  partners: [
    { name: "Cook Medical", desc: "Certified gastroenterology & interventional devices", logoUrl: "" },
    { name: "ZRH Medical", desc: "Endoscopy & disposable instrument manufacturing", logoUrl: "" },
    { name: "Cordis", desc: "Cardiology & peripheral vascular technologies", logoUrl: "" }
  ],
  clients: [
    { label: "Hospital Logo", logoUrl: "" },
    { label: "Hospital Logo", logoUrl: "" },
    { label: "Clinic Logo", logoUrl: "" },
    { label: "Clinic Logo", logoUrl: "" }
  ],
  gallery: [],
  contact: {
    name: "Naeem Ahmed", role: "CEO, INTRAMED SOLUTION",
    email: "info@intramedsolution.com", phone: "0346 4711440", address: "Lahore, Pakistan"
  },
  // Emails / phone numbers blocked from submitting the contact form.
  blockedContacts: []
};

let siteData = JSON.parse(JSON.stringify(DEFAULT_DATA));

function mergeWithDefaults(data) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_DATA));
  for (const key in data) {
    if (merged[key] && typeof merged[key] === 'object' && !Array.isArray(merged[key]) && typeof data[key] === 'object') {
      merged[key] = { ...merged[key], ...data[key] };
    } else {
      merged[key] = data[key];
    }
  }
  // One-time auto-fix: older saves may still carry the pre-migration flat
  // .html links (from before the site moved to clean /xxx-devices/ URLs).
  // Silently upgrade them so the homepage's category cards never point at
  // a stale/redirecting URL, no matter how old the saved data is.
  const LEGACY_LINK_MAP = {
    'gastroenterology.html': '/gastroenterology-devices/',
    'cardiology.html': '/cardiology-devices/',
    'vascular.html': '/vascular-devices/',
    'contact.html': '/contact/'
  };
  if (Array.isArray(merged.categories)) {
    merged.categories = merged.categories.map(c => ({
      ...c,
      link: LEGACY_LINK_MAP[c.link] || c.link
    }));
  }
  return merged;
}

const genericIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12c2-4 4-6 6 0s4 4 6 0 3-6 4-2"/></svg>';

/* ---------------- HOME PAGE RENDER FUNCTIONS ---------------- */
function renderHero() {
  const el = (id) => document.getElementById(id);
  if (!el('heroEyebrow')) return;
  el('heroEyebrow').textContent = siteData.hero.eyebrow;
  el('heroTagline').textContent = siteData.hero.tagline;
  el('heroStat1Num').textContent = siteData.hero.stat1Num;
  el('heroStat1Label').textContent = siteData.hero.stat1Label;
  el('heroStat2Num').textContent = siteData.hero.stat2Num;
  el('heroStat2Label').textContent = siteData.hero.stat2Label;
  el('heroStat3Num').textContent = siteData.hero.stat3Num;
  el('heroStat3Label').textContent = siteData.hero.stat3Label;
}

function renderAbout() {
  const title = document.getElementById('aboutTitle');
  if (!title) return;
  title.textContent = siteData.about.title;
  document.getElementById('aboutSubtitle').textContent = siteData.about.subtitle;
  const list = document.getElementById('aboutList');
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>';
  list.innerHTML = siteData.about.points.map(pt => `<li>${check}${pt}</li>`).join('');
}

function renderVisionMission() {
  const v = document.getElementById('visionText');
  if (!v) return;
  v.textContent = siteData.vision;
  document.getElementById('missionText').textContent = siteData.mission;
}

function renderCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;
  // Same themed icons used on each speciality's own page, so the homepage
  // cards visually match where they lead.
  const icons = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v4a4 4 0 004 4 4 4 0 014 4c0 3-2.5 6-6 6s-7-2.5-7-6c0-2 1-3.5 1-5.5S3 6 5 4c1-1 2-1 3-1z"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 4c0 4 3 4 3 8s-3 4-3 8"/><path d="M20 4c0 4-3 4-3 8s3 4 3 8"/><path d="M7 12h10"/></svg>'
  ];
  // Matching accent colours from each speciality page's own theme.
  const accents = ['#0d8a8a, #0a6363', '#c2185b, #8b1538', '#5b3fd6, #3d2aa8'];
  grid.innerHTML = siteData.categories.map((c, i) => `
    <a href="${c.link || '#'}" class="cat-card reveal in" style="display:block;">
      <div class="cat-icon" style="background:linear-gradient(135deg, ${accents[i] || accents[0]});">${icons[i] || icons[0]}</div>
      <h3>${c.title}</h3>
      <p>${c.desc}</p>
    </a>
  `).join('');
}

function renderFeatured() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  grid.innerHTML = siteData.featured.map(p => `
    <div class="prod-card reveal in">
      <div class="prod-media">${p.imgUrl ? `<img src="${p.imgUrl}" alt="${p.title}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">` : genericIcon}</div>
      <div class="prod-body">
        <span class="prod-tag">${p.tag}</span>
        <h4>${p.title}</h4>
        <p>${p.desc}</p>
      </div>
    </div>
  `).join('');
}

/* ---------------- CATEGORY PAGE PHOTO GALLERY (gastro / cardio / vascular) ---------------- */
function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;
  const section = document.getElementById('gallerySection');
  const wanted = CATEGORY_BY_PAGE[PAGE];
  const items = (siteData.gallery || []).filter(g => g.category === wanted);
  if (!items.length) {
    if (section) section.style.display = 'none';
    grid.innerHTML = '';
    return;
  }
  if (section) section.style.display = '';
  grid.innerHTML = items.map(g => `
    <div class="prod-card reveal in">
      <div class="prod-media"><img src="${g.imgUrl}" alt="${g.caption || ''}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"></div>
      ${g.caption ? `<div class="prod-body"><p>${g.caption}</p></div>` : ''}
    </div>
  `).join('');
}

function renderPartners() {
  const row = document.getElementById('partnersRow');
  if (!row) return;
  row.innerHTML = siteData.partners.map(p => `
    <div class="partner-chip reveal in">
      ${p.logoUrl ? `<img class="p-logo" src="${p.logoUrl}" alt="${p.name} logo" loading="lazy">` : ''}
      <span class="p-name">${p.name}</span><span class="p-desc">${p.desc}</span>
    </div>
  `).join('');
}

function renderClients() {
  const grid = document.getElementById('clientGrid');
  if (!grid) return;
  grid.innerHTML = siteData.clients.map(c => `
    <div class="client-slot reveal in">
      ${c.logoUrl ? `<img src="${c.logoUrl}" alt="${c.label}" loading="lazy">` : c.label}
    </div>
  `).join('');
}

function renderContactInfo() {
  const el = document.getElementById('contactName');
  if (!el) return;
  el.textContent = siteData.contact.name;
  document.getElementById('contactRole').textContent = siteData.contact.role;
  document.getElementById('contactEmail').textContent = siteData.contact.email;
  document.getElementById('contactPhone').textContent = siteData.contact.phone;
  document.getElementById('contactAddress').textContent = siteData.contact.address;
}

/* ---------------- CATEGORY PAGE RENDER (gastro / cardio / vascular) ---------------- */
function renderCategoryCatalog() {
  const body = document.getElementById('catalogBody');
  if (!body) return;
  const wanted = CATEGORY_BY_PAGE[PAGE];
  const rows = siteData.catalog.filter(r => r.category === wanted);
  const wrap = document.getElementById('catalogWrap');
  const emptyNote = document.getElementById('catalogEmptyNote');
  const countLabel = document.getElementById('catalogCount');

  if (!rows.length) {
    if (wrap) wrap.style.display = 'none';
    if (emptyNote) emptyNote.style.display = 'block';
    removeSchema();
    return;
  }
  if (wrap) wrap.style.display = 'block';
  if (emptyNote) emptyNote.style.display = 'none';
  if (countLabel) countLabel.textContent = rows.length + (rows.length === 1 ? ' device currently supplied' : ' devices currently supplied');

  body.innerHTML = rows.map((row, i) => `
    <tr>
      <td class="sr">${i + 1}</td>
      <td class="cat-photo">${row.imgUrl ? `<img src="${row.imgUrl}" alt="${row.name}" loading="lazy" style="width:56px;height:56px;object-fit:cover;border-radius:8px;">` : ''}</td>
      <td>${row.name}</td>
      <td class="spec">${row.spec}</td>
    </tr>
  `).join('');

  injectSchema(rows, wanted);
}

function injectSchema(rows, categoryName) {
  removeSchema();
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": rows.map((row, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": ["Product", "MedicalDevice"],
        "name": row.name,
        "description": row.spec,
        "category": categoryName,
        "image": row.imgUrl || undefined,
        "brand": { "@type": "Organization", "name": "IntraMed Solution" },
        "manufacturer": { "@type": "Organization", "name": "IntraMed Solution" }
      }
    }))
  };
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'productSchema';
  script.textContent = JSON.stringify(itemList);
  document.head.appendChild(script);
}
function removeSchema() {
  const existing = document.getElementById('productSchema');
  if (existing) existing.remove();
}

function renderAll() {
  renderHero(); renderAbout(); renderVisionMission(); renderCategories();
  renderFeatured(); renderPartners(); renderClients(); renderContactInfo();
  renderCategoryCatalog(); renderGallery();
}

/* ---------------- LIVE SYNC (every page) ---------------- */

// ========== CACHE-FIRST BOOT ==========
// Show yesterday's cached catalog INSTANTLY (no "Catalog is being updated"
// flash), then let the onSnapshot listener below silently swap in the real,
// fresh data the moment it arrives from Firestore.

function loadLocalCache() {
  try {
    const cached = localStorage.getItem('siteDataCache');
    const cacheTime = parseInt(localStorage.getItem('cacheTimestamp') || '0', 10);
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    if (cached && cacheTime > oneDayAgo) {
      siteData = mergeWithDefaults(JSON.parse(cached));
      return true;
    }
  } catch (e) {
    console.log('Cache read failed:', e);
  }
  return false;
}

function saveLocalCache() {
  // Never write an empty/default catalog to cache — that's exactly what
  // was clobbering a good cache and bringing the loading flash back.
  if (!siteData || !Array.isArray(siteData.catalog) || !siteData.catalog.length) return;
  try {
    localStorage.setItem('siteDataCache', JSON.stringify(siteData));
    localStorage.setItem('cacheTimestamp', Date.now().toString());
  } catch (e) {
    console.log('Cache save failed (quota exceeded)');
  }
}

// 1) Paint instantly from cache if we have one (first frame, no network wait).
loadLocalCache();
renderAll();

// 2) Firestore keeps everything live — first delivery (cached or server,
//    Firestore's SDK decides) repaints and refreshes the cache in the background.
onSnapshot(CONTENT_DOC, (snap) => {
  if (snap.exists()) {
    siteData = mergeWithDefaults(snap.data());
    renderAll();
    saveLocalCache();
    if (isAdmin) populateAdminLists();
  } else if (isAdmin) {
    // Extremely rare: the content doc genuinely doesn't exist yet (fresh
    // Firebase project). Only an authenticated admin can create it —
    // regular visitors just see the built-in DEFAULT_DATA.
    setDoc(CONTENT_DOC, DEFAULT_DATA).catch(err => console.error('Bootstrap write failed:', err));
  }
}, (err) => {
  console.error("Firestore sync error:", err);
});

async function saveToCloud() {
  const syncStatus = document.getElementById('syncStatus');
  try {
    await setDoc(CONTENT_DOC, siteData);
    if (syncStatus) {
      syncStatus.textContent = "Saved — live for all visitors.";
      syncStatus.classList.add('show');
    }
  } catch (err) {
    console.error("Save failed:", err);
    if (syncStatus) {
      syncStatus.textContent = "Save failed — check Firestore rules / connection.";
      syncStatus.classList.add('show');
    }
    throw err;
  }
}

/* ---------------- LIVE VISITOR PRESENCE (every page) ----------------
   Lightweight "who's on the site right now" tracker for the admin
   dashboard's Live Visitors tab. Not a security/blocking feature — just
   visibility. Each browser gets a random device id (localStorage), we
   look up its public IP via a free API, and write a heartbeat doc to
   Firestore every ~40s while the tab is open/visible. */
function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem('imd_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : 'dev-' + Math.random().toString(36).slice(2) + Date.now());
      localStorage.setItem('imd_device_id', id);
    }
    return id;
  } catch (e) {
    return 'dev-' + Math.random().toString(36).slice(2);
  }
}

function parseUserAgent(ua) {
  ua = ua || '';
  let browser = 'Unknown browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  let os = 'Unknown device';
  if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'Mac';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `${browser} on ${os}`;
}

(async function trackVisitorPresence() {
  const deviceId = getOrCreateDeviceId();
  const visitorDoc = doc(VISITORS_COL, deviceId);
  let ip = 'Unknown';
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (res.ok) { ip = (await res.json()).ip || 'Unknown'; }
  } catch (e) {
    // IP lookup blocked or offline — presence still gets tracked without it.
  }

  async function beat() {
    try {
      await setDoc(visitorDoc, {
        ip,
        userAgent: navigator.userAgent,
        deviceLabel: parseUserAgent(navigator.userAgent),
        page: document.body.dataset.page || 'unknown',
        lastSeen: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      // Non-critical — never let presence tracking break the site.
    }
  }

  beat();
  setInterval(() => { if (document.visibilityState === 'visible') beat(); }, 40000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat(); });
})();

/* ---------------- CONTACT FORM (contact.html) ---------------- */
const form = document.getElementById('contactForm');
if (form) {
  const formNote = document.getElementById('formNote');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('.submit-btn');
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();
    const message = document.getElementById('message').value.trim();

    // Silently reject messages from blocked emails/phone numbers — no
    // indication is given to the sender that they were specifically
    // blocked, so spammers can't tell the difference from a normal send.
    const norm = (s) => (s || '').trim().toLowerCase();
    const blocked = (siteData.blockedContacts || []).some(b =>
      (norm(b.email) && norm(b.email) === norm(email)) ||
      (norm(b.phone) && norm(b.phone) === norm(phone))
    );
    if (blocked) {
      formNote.textContent = 'Thank you — your message has been noted. Our team will contact you shortly.';
      formNote.classList.add('show');
      form.reset();
      return;
    }

    submitBtn.disabled = true;
    try {
      await addDoc(INQUIRIES_COL, { name, phone, email, message, createdAt: serverTimestamp() });
      logEvent(analytics, 'generate_lead', { form: 'contact_form' });
      formNote.textContent = 'Thank you — your message has been noted. Our team will contact you shortly.';
      formNote.classList.add('show');
      form.reset();
    } catch (err) {
      console.error('Failed to save inquiry:', err);
      formNote.textContent = 'Something went wrong sending your message. Please try again or contact us directly.';
      formNote.classList.add('show');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------------- ADMIN DASHBOARD (index.html only) ---------------- */
const adminLoginOverlay = document.getElementById('adminLoginOverlay');
const adminDashOverlay = document.getElementById('adminDashOverlay');

if (adminLoginOverlay && adminDashOverlay) {
  // True when this copy of index.html is running inside the "View Live Site"
  // preview iframe. In that case we must never auto-open the login/dashboard
  // overlay, even though Firebase Auth will report the admin as logged in
  // (the iframe shares sessionStorage with the parent dashboard tab).
  const isPreviewFrame = new URLSearchParams(window.location.search).get('preview') === '1';

  // One-time bulk helper — run from browser console while logged in as admin:
  // __bulkAddCatalog([{name:"...", spec:"..."}, ...], "Gastroenterology")
  // Replaces all rows of that category in one go — no need to use the Add form 16 times.
  window.__bulkAddCatalog = async function (items, category) {
    siteData.catalog = siteData.catalog.filter(r => r.category !== category);
    items.forEach(it => siteData.catalog.push({ name: it.name, spec: it.spec, category }));
    renderAll();
    saveLocalCache();
    await saveToCloud();
    console.log('Bulk replaced', category, 'with', items.length, 'items — saved to cloud.');
  };

  /* ---- Dynamic time-of-day greeting shown at the top of the dashboard ---- */
  const ADMIN_NAME = "Naeem";
  const ADMIN_GREETINGS = {
    morning: [
      { eyebrow: "Good Morning", msg: `Subah bakhair, ${ADMIN_NAME}!`, sub: "Want a cup of tea before you dive in?" },
      { eyebrow: "Good Morning", msg: `Rise and shine, ${ADMIN_NAME}.`, sub: "Let's see what the site needs today." },
      { eyebrow: "Good Morning", msg: `Good morning, dear ${ADMIN_NAME}.`, sub: "Hope you slept well — ready for a productive day?" },
      { eyebrow: "Good Morning", msg: `Assalam-o-Alaikum, ${ADMIN_NAME}.`, sub: "A fresh morning, a fresh look at IntraMed Solution." }
    ],
    afternoon: [
      { eyebrow: "Good Afternoon", msg: `Good afternoon, ${ADMIN_NAME}.`, sub: "Had lunch yet? Let's get through today's updates." },
      { eyebrow: "Good Afternoon", msg: `How are you, dear ${ADMIN_NAME}?`, sub: "Everything's synced and ready for you." },
      { eyebrow: "Good Afternoon", msg: `Welcome back, ${ADMIN_NAME}.`, sub: "Here's your dashboard, right where you left it." }
    ],
    evening: [
      { eyebrow: "Good Evening", msg: `Good evening, ${ADMIN_NAME}.`, sub: "Want a cup of tea while you go through this?" },
      { eyebrow: "Good Evening", msg: `Evening, ${ADMIN_NAME}!`, sub: "A quiet moment to review today's changes." },
      { eyebrow: "Good Evening", msg: `Welcome back, ${ADMIN_NAME}.`, sub: "Let's wrap up anything pending for today." }
    ],
    night: [
      { eyebrow: "Working Late", msg: `Still up, ${ADMIN_NAME}?`, sub: "Don't stay too long — the site can wait till morning too." },
      { eyebrow: "Good Night", msg: `Late night session, ${ADMIN_NAME}?`, sub: "Take your time, everything saves safely to the cloud." },
      { eyebrow: "Good Night", msg: `Hope your day went well, ${ADMIN_NAME}.`, sub: "Quick edit, then get some rest." }
    ]
  };
  function getAdminTimeBand() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
  }
  function renderAdminGreeting() {
    const eyebrowEl = document.getElementById('adminGreetingEyebrow');
    const msgEl = document.getElementById('adminGreetingMsg');
    const subEl = document.getElementById('adminGreetingSub');
    if (!msgEl) return;
    const pool = ADMIN_GREETINGS[getAdminTimeBand()];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (eyebrowEl) eyebrowEl.textContent = pick.eyebrow;
    msgEl.textContent = pick.msg;
    if (subEl) subEl.textContent = pick.sub;
  }
  function renderAdminQuickStats() {
    const el = document.getElementById('adminQuickStats');
    if (!el) return;
    el.textContent = `${siteData.catalog.length} catalog items  ·  ${siteData.featured.length} featured  ·  ${(siteData.gallery || []).length} photos  ·  ${siteData.partners.length} partners  ·  ${siteData.clients.length} clients`;
  }

  /* ---- "View Live Site" split/toggle panel ---- */
  const adminShellEl = document.querySelector('.admin-shell');
  const viewSiteBtn = document.getElementById('viewSiteBtn');
  const closeSitePreviewBtn = document.getElementById('closeSitePreviewBtn');
  const siteFrame = document.getElementById('siteFrame');
  function openSitePreview() {
    // "?preview=1" tells the loaded copy of index.html (inside the iframe) not
    // to auto-open the admin dashboard, even though it will see the same
    // logged-in session (sessionStorage is shared with the parent tab).
    if (siteFrame && !siteFrame.getAttribute('src')) siteFrame.setAttribute('src', 'index.html?preview=1');
    if (adminShellEl) adminShellEl.classList.add('site-open');
    if (viewSiteBtn) viewSiteBtn.textContent = 'Back to Dashboard';
  }
  function closeSitePreview() {
    if (adminShellEl) adminShellEl.classList.remove('site-open');
    if (viewSiteBtn) viewSiteBtn.textContent = 'View Live Site';
  }
  if (viewSiteBtn) {
    viewSiteBtn.addEventListener('click', () => {
      if (adminShellEl && adminShellEl.classList.contains('site-open')) closeSitePreview();
      else openSitePreview();
    });
  }
  if (closeSitePreviewBtn) closeSitePreviewBtn.addEventListener('click', closeSitePreview);

  function openAdminEntry() {
    if (isPreviewFrame) return;
    if (mobileNav) mobileNav.classList.remove('open');
    if (isAdmin) {
      populateAdminLists();
      renderAdminGreeting();
      adminDashOverlay.classList.add('open');
    } else {
      adminLoginOverlay.classList.add('open');
    }
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  if (window.location.hash === '#admin') openAdminEntry();
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#admin') openAdminEntry();
  });

  document.getElementById('closeLoginBtn').addEventListener('click', () => adminLoginOverlay.classList.remove('open'));
  document.getElementById('closeDashBtn').addEventListener('click', () => {
    adminDashOverlay.classList.remove('open');
    closeSitePreview();
  });

  document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('adminUser').value.trim();
    const p = document.getElementById('adminPass').value;
    const loginError = document.getElementById('loginError');
    const email = (u === "naeemjan999") ? ADMIN_EMAIL : u;
    try {
      await signInWithEmailAndPassword(auth, email, p);
    } catch (err) {
      console.error(err);
      loginError.textContent = "Login failed: " + (err.code || err.message || "unknown error");
      loginError.classList.add('show');
    }
  });

  onAuthStateChanged(auth, async (user) => {
    isAdmin = !!user;
    if (isAdmin && !isPreviewFrame) {
      document.getElementById('loginError').classList.remove('show');
      document.getElementById('adminLoginForm').reset();
      adminLoginOverlay.classList.remove('open');
      // Open the dashboard INSTANTLY using whatever siteData we already have
      // (cache or the live onSnapshot data) — no network wait here. The
      // onSnapshot listener above keeps siteData fresh in the background,
      // and it also creates the Firestore doc automatically the one time
      // it's genuinely missing (see the `!snap.exists()` branch there).
      populateAdminLists();
      renderAdminGreeting();
      adminDashOverlay.classList.add('open');
    }
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
    await signOut(auth);
    adminDashOverlay.classList.remove('open');
    closeSitePreview();
  });

  // Active category filter for the Catalog admin list ("All" by default).
  let catalogFilter = 'All';
  const catalogFilterRow = document.getElementById('catalogFilterRow');
  if (catalogFilterRow) {
    catalogFilterRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.catfilter-btn');
      if (!btn) return;
      catalogFilterRow.querySelectorAll('.catfilter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      catalogFilter = btn.dataset.cat;
      populateAdminLists();
    });
  }

  let visitorsAutoRefresh = null;
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'tabInquiries') { loadInquiries(); renderBlockedUsersList(); }
      if (btn.dataset.tab === 'tabVisitors') {
        loadVisitors();
        if (visitorsAutoRefresh) clearInterval(visitorsAutoRefresh);
        visitorsAutoRefresh = setInterval(loadVisitors, 20000);
      } else if (visitorsAutoRefresh) {
        clearInterval(visitorsAutoRefresh);
        visitorsAutoRefresh = null;
      }
    });
  });

  function timeAgo(date) {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return secs + 's ago';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  const PAGE_LABELS = {
    home: 'Home', gastroenterology: 'Gastroenterology', cardiology: 'Cardiology',
    vascular: 'Vascular', contact: 'Contact'
  };

  async function loadVisitors() {
    const list = document.getElementById('visitorsAdminList');
    const summary = document.getElementById('visitorsSummary');
    if (!list.innerHTML) list.innerHTML = '<div class="ali-text"><span>Loading\u2026</span></div>';
    try {
      const q = query(VISITORS_COL, orderBy('lastSeen', 'desc'));
      const snap = await getDocs(q);
      if (snap.empty) {
        list.innerHTML = '<div class="admin-empty">No visitors tracked yet.</div>';
        if (summary) summary.textContent = '';
        return;
      }
      const now = Date.now();
      let onlineCount = 0;
      const rows = snap.docs.map(d => {
        const v = d.data();
        const seenDate = v.lastSeen && v.lastSeen.toDate ? v.lastSeen.toDate() : null;
        const secsAgo = seenDate ? (now - seenDate.getTime()) / 1000 : Infinity;
        const online = secsAgo < 90;
        if (online) onlineCount++;
        return { v, online, seenDate, secsAgo };
      });
      // Online visitors first, then most-recently-seen.
      rows.sort((a, b) => (b.online - a.online) || ((a.seenDate || 0) - (b.seenDate || 0) < 0 ? 1 : -1));
      if (summary) summary.textContent = `${onlineCount} online now \u00b7 ${rows.length} tracked total`;
      list.innerHTML = rows.map(({ v, online, seenDate }) => `
        <div class="admin-list-item">
          <div class="ali-text">
            <b>${online ? '\ud83d\udfe2 Online' : '\u26aa Offline'} \u2014 ${v.ip || 'Unknown IP'}</b>
            <span>${PAGE_LABELS[v.page] || v.page || 'Unknown page'} \u00b7 ${v.deviceLabel || 'Unknown device'}</span>
            <span>Last seen: ${seenDate ? timeAgo(seenDate) : 'Unknown'}</span>
          </div>
        </div>`).join('');
    } catch (err) {
      console.error('Failed to load visitors:', err);
      list.innerHTML = '<div class="ali-text"><span>Could not load visitors. Check Firestore rules/connection.</span></div>';
    }
  }
  document.getElementById('refreshVisitorsBtn').addEventListener('click', loadVisitors);

  async function loadInquiries() {
    const list = document.getElementById('inquiriesAdminList');
    list.innerHTML = '<div class="ali-text"><span>Loading\u2026</span></div>';
    try {
      const q = query(INQUIRIES_COL, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      if (snap.empty) {
        list.innerHTML = '<div class="ali-text"><span>No messages yet.</span></div>';
        return;
      }
      list.innerHTML = snap.docs.map(d => {
        const v = d.data();
        const when = v.createdAt && v.createdAt.toDate ? v.createdAt.toDate().toLocaleString() : '';
        return `
          <div class="admin-list-item">
            <div class="ali-text">
              <b>${v.name || '(no name)'} \u2014 ${v.phone || ''}</b>
              <span>${v.email || ''}</span>
              <span>${v.message || ''}</span>
              <span>${when}</span>
            </div>
            <button type="button" class="btn btn-outline inquiry-block-btn" data-name="${(v.name || '').replace(/"/g, '&quot;')}" data-email="${(v.email || '').replace(/"/g, '&quot;')}" data-phone="${(v.phone || '').replace(/"/g, '&quot;')}" style="margin-right:6px;">Block</button>
            <button type="button" class="btn btn-outline inquiry-delete-btn" data-id="${d.id}">Delete</button>
          </div>`;
      }).join('');
      list.querySelectorAll('.inquiry-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Is message ko delete kar dein?')) return;
          btn.disabled = true;
          try {
            await deleteDoc(doc(db, 'inquiries', btn.dataset.id));
            btn.closest('.admin-list-item').remove();
          } catch (err) {
            console.error('Failed to delete inquiry:', err);
            alert('Delete nahi ho saka. Dobara koshish karein.');
            btn.disabled = false;
          }
        });
      });
      list.querySelectorAll('.inquiry-block-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const { name, email, phone } = btn.dataset;
          if (!email && !phone) { alert('Is inquiry mein koi email ya phone nahi hai to block karne ke liye.'); return; }
          if (!confirm(`${name || 'Is user'} ko block kar dein? Yeh dobara contact form submit nahi kar sakega.`)) return;
          btn.disabled = true;
          try {
            siteData.blockedContacts = siteData.blockedContacts || [];
            siteData.blockedContacts.push({ name, email, phone, blockedAt: Date.now() });
            await saveToCloud();
            renderBlockedUsersList();
            btn.textContent = 'Blocked';
          } catch (err) {
            console.error('Failed to block user:', err);
            alert('Block nahi ho saka. Dobara koshish karein.');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      console.error('Failed to load inquiries:', err);
      list.innerHTML = '<div class="ali-text"><span>Could not load messages. Check Firestore rules/connection.</span></div>';
    }
  }
  document.getElementById('refreshInquiriesBtn').addEventListener('click', loadInquiries);

  function renderBlockedUsersList() {
    const list = document.getElementById('blockedUsersList');
    if (!list) return;
    const blocked = siteData.blockedContacts || [];
    list.innerHTML = blocked.length ? blocked.map((b, i) => `
      <div class="admin-list-item">
        <div class="ali-text">
          <b>${b.name || b.email || b.phone || 'Blocked entry'}</b>
          <span>${[b.email, b.phone].filter(Boolean).join(' \u2014 ')}</span>
        </div>
        <button type="button" class="btn btn-outline unblock-btn" data-index="${i}">Unblock</button>
      </div>`).join('') : '<div class="admin-empty">No blocked users.</div>';
    list.querySelectorAll('.unblock-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          siteData.blockedContacts.splice(Number(btn.dataset.index), 1);
          await saveToCloud();
          renderBlockedUsersList();
        } catch (err) {
          console.error('Failed to unblock user:', err);
          alert('Unblock nahi ho saka. Dobara koshish karein.');
          btn.disabled = false;
        }
      });
    });
  }

  const blockUserForm = document.getElementById('blockUserForm');
  if (blockUserForm) {
    blockUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('blockUserInput');
      const value = input.value.trim();
      if (!value) return;
      const isEmail = value.includes('@');
      siteData.blockedContacts = siteData.blockedContacts || [];
      siteData.blockedContacts.push(isEmail ? { email: value } : { phone: value });
      const btn = blockUserForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await saveToCloud();
        input.value = '';
        renderBlockedUsersList();
      } catch (err) {
        console.error('Failed to block user:', err);
        alert('Block nahi ho saka. Dobara koshish karein.');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function populateAdminLists() {
    renderAdminQuickStats();
    renderBlockedUsersList();
    const catList = document.getElementById('catalogAdminList');
    // Only show rows matching the active filter tab (All / Gastroenterology /
    // Cardiology / Vascular). Each row keeps its real index in siteData.catalog
    // (via data-index) so delete still targets the correct item after filtering.
    const filteredEntries = siteData.catalog
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => catalogFilter === 'All' || (row.category || 'Gastroenterology') === catalogFilter);
    catList.innerHTML = filteredEntries.length ? filteredEntries.map(({ row, i }) => `
      <div class="admin-list-item">
        ${row.imgUrl ? `<img src="${row.imgUrl}" alt="" loading="lazy" style="height:32px;width:32px;object-fit:cover;border-radius:6px;margin-right:10px;">` : ''}
        <div class="ali-text"><b>${row.name}</b><span>${row.category || 'Gastroenterology'} \u2014 ${row.spec}</span></div>
        <button class="admin-del-btn" data-type="catalog" data-index="${i}">\u2715</button>
      </div>`).join('') : `<div class="admin-empty">No ${catalogFilter === 'All' ? 'catalog items' : catalogFilter + ' products'} yet.</div>`;

    const featList = document.getElementById('featuredAdminList');
    featList.innerHTML = siteData.featured.length ? siteData.featured.map((p, i) => `
      <div class="admin-list-item">
        ${p.imgUrl ? `<img src="${p.imgUrl}" alt="" loading="lazy" style="height:32px;width:32px;object-fit:cover;border-radius:6px;margin-right:10px;">` : ''}
        <div class="ali-text"><b>${p.title}</b><span>${p.tag} \u2014 ${p.desc}</span></div>
        <button class="admin-del-btn" data-type="featured" data-index="${i}">\u2715</button>
      </div>`).join('') : '<div class="admin-empty">No featured products yet.</div>';

    const galList = document.getElementById('galleryAdminList');
    if (galList) {
      const gallery = siteData.gallery || [];
      galList.innerHTML = gallery.length ? gallery.map((g, i) => `
        <div class="admin-list-item">
          <img src="${g.imgUrl}" alt="" loading="lazy" style="height:32px;width:32px;object-fit:cover;border-radius:6px;margin-right:10px;">
          <div class="ali-text"><b>${g.category}</b><span>${g.caption || ''}</span></div>
          <button class="admin-del-btn" data-type="gallery" data-index="${i}">\u2715</button>
        </div>`).join('') : '<div class="admin-empty">No product photos yet.</div>';
    }

    const partList = document.getElementById('partnersAdminList');
    partList.innerHTML = siteData.partners.length ? siteData.partners.map((p, i) => `
      <div class="admin-list-item">
        <div class="ali-text"><b>${p.name}</b><span>${p.desc}</span></div>
        <button class="admin-del-btn" data-type="partner" data-index="${i}">\u2715</button>
      </div>`).join('') : '<div class="admin-empty">No partners yet.</div>';

    const clientList = document.getElementById('clientsAdminList');
    clientList.innerHTML = siteData.clients.length ? siteData.clients.map((c, i) => `
      <div class="admin-list-item">
        ${c.logoUrl ? `<img src="${c.logoUrl}" alt="" loading="lazy" style="height:32px;width:auto;max-width:90px;object-fit:contain;margin-right:10px;">` : ''}
        <div class="ali-text"><b>${c.label || 'Client logo'}</b></div>
        <button class="admin-del-btn" data-type="client" data-index="${i}">\u2715</button>
      </div>`).join('') : '<div class="admin-empty">No clients yet.</div>';

    const el = (id) => document.getElementById(id);
    el('editHeroEyebrow').value = siteData.hero.eyebrow;
    el('editHeroTagline').value = siteData.hero.tagline;
    el('editStat1Num').value = siteData.hero.stat1Num;
    el('editStat1Label').value = siteData.hero.stat1Label;
    el('editStat2Num').value = siteData.hero.stat2Num;
    el('editStat2Label').value = siteData.hero.stat2Label;
    el('editStat3Num').value = siteData.hero.stat3Num;
    el('editStat3Label').value = siteData.hero.stat3Label;

    el('editAboutTitle').value = siteData.about.title;
    el('editAboutSubtitle').value = siteData.about.subtitle;
    el('editAboutPoint1').value = siteData.about.points[0] || "";
    el('editAboutPoint2').value = siteData.about.points[1] || "";
    el('editAboutPoint3').value = siteData.about.points[2] || "";

    el('editVision').value = siteData.vision;
    el('editMission').value = siteData.mission;

    el('editCat1Title').value = siteData.categories[0]?.title || "";
    el('editCat1Desc').value = siteData.categories[0]?.desc || "";
    el('editCat2Title').value = siteData.categories[1]?.title || "";
    el('editCat2Desc').value = siteData.categories[1]?.desc || "";
    el('editCat3Title').value = siteData.categories[2]?.title || "";
    el('editCat3Desc').value = siteData.categories[2]?.desc || "";

    el('editContactName').value = siteData.contact.name;
    el('editContactRole').value = siteData.contact.role;
    el('editContactEmail').value = siteData.contact.email;
    el('editContactPhone').value = siteData.contact.phone;
    el('editContactAddress').value = siteData.contact.address;

    attachDeleteHandlers();
  }

  function attachDeleteHandlers() {
    document.querySelectorAll('.admin-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        const idx = parseInt(btn.dataset.index, 10);
        if (type === 'catalog') siteData.catalog.splice(idx, 1);
        if (type === 'featured') siteData.featured.splice(idx, 1);
        if (type === 'gallery') siteData.gallery.splice(idx, 1);
        if (type === 'partner') siteData.partners.splice(idx, 1);
        if (type === 'client') siteData.clients.splice(idx, 1);
        renderAll();
    saveLocalCache();
        populateAdminLists();
        await saveToCloud();
      });
    });
  }

  // Images are stored as compressed base64 directly in Firestore (no Firebase
  // Storage / Blaze plan needed). Resized + JPEG-compressed client-side to
  // keep the single shared content document well under Firestore's 1MB cap.
  function compressImageToDataUrl(file, maxDim = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
      if (!file) { resolve(""); return; }
      const img = new Image();
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.onload = () => {
        img.onerror = () => reject(new Error('Could not load the selected image.'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
            else { width = Math.round(width * (maxDim / height)); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadLogo(file, folder) {
    return compressImageToDataUrl(file);
  }

  document.getElementById('catalogAddForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('catName').value.trim();
    const spec = document.getElementById('catSpec').value.trim();
    const category = document.getElementById('catCategory').value;
    const fileInput = document.getElementById('catImage');
    const btn = document.getElementById('catalogAddBtn');
    const note = document.getElementById('catalogAddNote');
    if (!name || !spec) return;

    const file = fileInput.files[0];
    btn.disabled = true;
    note.className = 'form-note show';
    note.textContent = file ? 'Uploading photo\u2026' : 'Saving\u2026';

    try {
      const imgUrl = file ? await uploadLogo(file, 'catalog') : '';
      siteData.catalog.push({ name, spec, category, imgUrl });
      e.target.reset();
      // Keep the category dropdown on whatever was just used, instead of
      // snapping back to "Gastroenterology" (the first <option>) after every
      // reset — this is what was causing products to get silently added to
      // the wrong speciality when adding several in a row.
      document.getElementById('catCategory').value = category;
      catalogFilter = category;
      const filterRow = document.getElementById('catalogFilterRow');
      if (filterRow) {
        filterRow.querySelectorAll('.catfilter-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === category));
      }
      renderAll(); populateAdminLists();
      await saveToCloud();
      note.textContent = 'Product added.';
      setTimeout(() => { note.className = 'form-note'; note.textContent = ''; }, 2500);
    } catch (err) {
      console.error('Add catalog item failed:', err);
      const reason = (err && (err.code || err.message)) ? (err.code || err.message) : 'upload failed. Please try again.';
      note.textContent = 'Could not add product: ' + reason;
      alert('Photo upload failed (' + reason + '). The product was NOT saved.');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('featuredAddForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tag = document.getElementById('featTag').value.trim();
    const title = document.getElementById('featTitle').value.trim();
    const desc = document.getElementById('featDesc').value.trim();
    const fileInput = document.getElementById('featImage');
    const btn = document.getElementById('featuredAddBtn');
    const note = document.getElementById('featuredAddNote');
    if (!tag || !title || !desc) return;

    const file = fileInput.files[0];
    btn.disabled = true;
    note.className = 'form-note show';
    note.textContent = file ? 'Uploading photo\u2026' : 'Saving\u2026';

    try {
      const imgUrl = file ? await uploadLogo(file, 'featured') : '';
      siteData.featured.push({ tag, title, desc, imgUrl });
      e.target.reset();
      renderAll(); populateAdminLists();
      await saveToCloud();
      note.textContent = 'Featured product added.';
      setTimeout(() => { note.className = 'form-note'; note.textContent = ''; }, 2500);
    } catch (err) {
      console.error('Add featured product failed:', err);
      const reason = (err && (err.code || err.message)) ? (err.code || err.message) : 'upload failed. Please try again.';
      note.textContent = 'Could not add product: ' + reason;
      alert('Photo upload failed (' + reason + '). The product was NOT saved.');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('galleryAddForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = document.getElementById('galleryCategory').value;
    const caption = document.getElementById('galleryCaption').value.trim();
    const fileInput = document.getElementById('galleryImage');
    const btn = document.getElementById('galleryAddBtn');
    const note = document.getElementById('galleryAddNote');
    const file = fileInput.files[0];
    if (!file) {
      note.className = 'form-note show';
      note.textContent = 'Please choose a photo first.';
      return;
    }

    btn.disabled = true;
    note.className = 'form-note show';
    note.textContent = 'Uploading photo\u2026';

    try {
      const imgUrl = await uploadLogo(file, 'gallery');
      siteData.gallery = siteData.gallery || [];
      siteData.gallery.push({ imgUrl, category, caption });
      e.target.reset();
      renderAll(); populateAdminLists();
      await saveToCloud();
      note.textContent = 'Photo added.';
      setTimeout(() => { note.className = 'form-note'; note.textContent = ''; }, 2500);
    } catch (err) {
      console.error('Add gallery photo failed:', err);
      const reason = (err && (err.code || err.message)) ? (err.code || err.message) : 'upload failed. Please try again.';
      note.textContent = 'Could not add photo: ' + reason;
      alert('Photo upload failed (' + reason + '). It was NOT saved.');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('partnerAddForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('partName').value.trim();
    const desc = document.getElementById('partDesc').value.trim();
    const fileInput = document.getElementById('partLogo');
    const btn = document.getElementById('partnerAddBtn');
    const note = document.getElementById('partnerAddNote');
    if (!name || !desc) return;

    const file = fileInput.files[0];
    btn.disabled = true;
    note.className = 'form-note show';
    note.textContent = file ? 'Uploading logo\u2026' : 'Saving\u2026';

    try {
      const logoUrl = await uploadLogo(file, 'partners');
      siteData.partners.push({ name, desc, logoUrl });
      e.target.reset();
      renderAll(); populateAdminLists();
      await saveToCloud();
      note.textContent = 'Partner added.';
      setTimeout(() => { note.className = 'form-note'; note.textContent = ''; }, 2500);
    } catch (err) {
      console.error('Add partner failed:', err);
      const reason = (err && (err.code || err.message)) ? (err.code || err.message) : 'upload failed. Please try again.';
      note.textContent = 'Could not add partner: ' + reason;
      alert('Logo upload failed (' + reason + '). The partner was NOT saved.');
    } finally {
      btn.disabled = false;
    }
  });

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('clientAddForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('clientLogo');
    const btn = document.getElementById('clientAddBtn');
    const note = document.getElementById('clientAddNote');
    const file = fileInput.files[0];

    if (!file) {
      note.className = 'form-note show';
      note.textContent = 'Please choose a logo image first.';
      return;
    }
    const MAX_BYTES = 3 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      note.className = 'form-note show';
      note.textContent = 'That image is too large (max 3MB). Please use a smaller file.';
      return;
    }

    btn.disabled = true;
    note.className = 'form-note show';
    note.textContent = 'Saving logo\u2026';

    try {
      const logoUrl = await readFileAsDataUrl(file);
      siteData.clients.push({ label: '', logoUrl });
      e.target.reset();
      renderAll(); populateAdminLists();
      await saveToCloud();
      note.textContent = 'Client logo added.';
      setTimeout(() => { note.className = 'form-note'; note.textContent = ''; }, 2500);
    } catch (err) {
      console.error('Add client failed:', err);
      const reason = (err && err.message) ? err.message : 'could not save. Please try again.';
      note.textContent = 'Could not add client: ' + reason;
      alert('Could not add client logo: ' + reason);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('siteContentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = (id) => document.getElementById(id);
    siteData.hero = {
      eyebrow: el('editHeroEyebrow').value.trim() || siteData.hero.eyebrow,
      tagline: el('editHeroTagline').value.trim() || siteData.hero.tagline,
      stat1Num: el('editStat1Num').value.trim() || siteData.hero.stat1Num,
      stat1Label: el('editStat1Label').value.trim() || siteData.hero.stat1Label,
      stat2Num: el('editStat2Num').value.trim() || siteData.hero.stat2Num,
      stat2Label: el('editStat2Label').value.trim() || siteData.hero.stat2Label,
      stat3Num: el('editStat3Num').value.trim() || siteData.hero.stat3Num,
      stat3Label: el('editStat3Label').value.trim() || siteData.hero.stat3Label
    };
    siteData.about = {
      title: el('editAboutTitle').value.trim() || siteData.about.title,
      subtitle: el('editAboutSubtitle').value.trim() || siteData.about.subtitle,
      points: [el('editAboutPoint1').value.trim(), el('editAboutPoint2').value.trim(), el('editAboutPoint3').value.trim()].filter(Boolean)
    };
    siteData.vision = el('editVision').value.trim() || siteData.vision;
    siteData.mission = el('editMission').value.trim() || siteData.mission;
    siteData.categories = [
      { title: el('editCat1Title').value.trim() || siteData.categories[0]?.title || "", desc: el('editCat1Desc').value.trim() || siteData.categories[0]?.desc || "", link: siteData.categories[0]?.link || "/gastroenterology-devices/" },
      { title: el('editCat2Title').value.trim() || siteData.categories[1]?.title || "", desc: el('editCat2Desc').value.trim() || siteData.categories[1]?.desc || "", link: siteData.categories[1]?.link || "/cardiology-devices/" },
      { title: el('editCat3Title').value.trim() || siteData.categories[2]?.title || "", desc: el('editCat3Desc').value.trim() || siteData.categories[2]?.desc || "", link: siteData.categories[2]?.link || "/vascular-devices/" }
    ];
    renderAll();
    saveLocalCache();
    await saveToCloud();
  });

  document.getElementById('contactEditForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = (id) => document.getElementById(id);
    siteData.contact = {
      name: el('editContactName').value.trim() || siteData.contact.name,
      role: el('editContactRole').value.trim() || siteData.contact.role,
      email: el('editContactEmail').value.trim() || siteData.contact.email,
      phone: el('editContactPhone').value.trim() || siteData.contact.phone,
      address: el('editContactAddress').value.trim() || siteData.contact.address
    };
    renderAll();
    saveLocalCache();
    await saveToCloud();
  });
}

/* ================= AI CHATBOT (every page) + WHATSAPP BUTTON (contact page only) ================= */
(function initFloatingWidgets() {
  const PAGE_NOW = document.body.dataset.page || 'home';

  // Inject CSS directly (avoids any stylesheet-caching issues — only app.js
  // needs to be re-uploaded for this widget to work everywhere).
  const style = document.createElement('style');
  style.textContent = `
    #imdChatWrap{ position:fixed; right:22px; bottom:22px; z-index:9999; font-family:'Inter',sans-serif; }
    #imdChatToggle{
      width:58px; height:58px; border-radius:50%; border:none; cursor:pointer;
      background:linear-gradient(135deg, var(--accent,#c00000), var(--accent-dark,#8f0000));
      box-shadow:0 10px 26px rgba(192,0,0,.35); display:flex; align-items:center; justify-content:center;
      padding:8px; transition:transform .15s ease;
    }
    #imdChatToggle:hover{ transform:scale(1.06); }
    #imdChatToggle img{ width:100%; height:100%; object-fit:contain; border-radius:50%; background:#fff; }
    #imdChatPanel{
      display:none; position:absolute; right:0; bottom:70px; width:320px; max-width:88vw;
      max-height:70vh; background:var(--surface,#fff); border:1px solid var(--border,#eee);
      border-radius:16px; box-shadow:0 20px 50px rgba(0,0,0,.25); overflow:hidden; flex-direction:column;
    }
    #imdChatWrap.open #imdChatPanel{ display:flex; }
    #imdChatHead{ display:flex; align-items:center; gap:10px; padding:14px 16px; background:linear-gradient(135deg, var(--accent,#c00000), var(--accent-dark,#8f0000)); color:#fff; }
    #imdChatHead img{ width:34px; height:34px; border-radius:50%; background:#fff; object-fit:contain; padding:2px; flex-shrink:0; }
    #imdChatHead b{ display:block; font-size:14px; }
    #imdChatHead span{ display:block; font-size:11px; opacity:.85; }
    #imdChatClose{ margin-left:auto; background:none; border:none; color:#fff; font-size:22px; line-height:1; cursor:pointer; }
    #imdChatBody{ flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:8px; min-height:180px; max-height:340px; }
    .imd-msg{ padding:9px 13px; border-radius:12px; font-size:13.5px; line-height:1.5; max-width:85%; }
    .imd-msg.bot{ background:var(--accent-tint,#fbeaea); color:var(--text,#222); align-self:flex-start; border-bottom-left-radius:3px; }
    .imd-msg.user{ background:var(--accent,#c00000); color:#fff; align-self:flex-end; border-bottom-right-radius:3px; }
    #imdChatForm{ display:flex; gap:8px; padding:10px; border-top:1px solid var(--border,#eee); }
    #imdChatForm input{ flex:1; border:1px solid var(--border,#ddd); border-radius:20px; padding:9px 14px; font-size:13px; outline:none; }
    #imdChatForm input:focus{ border-color:var(--accent,#c00000); }
    #imdChatForm button{ width:36px; height:36px; border-radius:50%; border:none; background:var(--accent,#c00000); color:#fff; cursor:pointer; flex-shrink:0; }
    #imdWhatsappBtn{
      position:fixed; right:90px; bottom:22px; z-index:9998; width:56px; height:56px; border-radius:50%;
      background:#25D366; display:flex; align-items:center; justify-content:center; cursor:grab;
      box-shadow:0 10px 26px rgba(37,211,102,.4); touch-action:none;
    }
    #imdWhatsappBtn svg{ width:30px; height:30px; }
    #imdWhatsappBtn:active{ cursor:grabbing; }
  `;
  document.head.appendChild(style);

  /* ---------- FAQ knowledge base (English + Roman Urdu) — covers everything on the site ---------- */
  const FAQS = [
    {
      keywords_en: ['hello', 'hi ', 'hey', 'good morning', 'good afternoon', 'good evening'],
      keywords_ur: ['salam', 'assalam', 'aoa'],
      en: "Hello! Welcome to IntraMed Solution. How can I help you today?",
      ur: "Assalam-o-Alaikum! IntraMed Solution mein khush aamdeed. Main aapki kaise madad kar sakta hoon?"
    },
    {
      keywords_en: ['ceo', 'founder', 'who owns', 'who runs', 'who is the owner', 'who started', 'in charge', 'naeem', 'proprietor', 'head of', 'career', 'background', 'experience', 'verizon', 'fazal din', 'medisurg'],
      keywords_ur: ['ceo', 'malik', 'founder', 'naeem', 'kaun chalata', 'kaun banaya', 'career', 'tajurba'],
      en: "IntraMed Solution's CEO and founder is Mr. Naeem Ahmed, who has over 15 years of experience in the medical devices field. His career journey: he started at Verizon, then moved to Fazal Din (a well-known Pakistani pharmacy/healthcare chain), then worked at MediSurg as a Regional Sales Manager in the cardiology devices space, and after gaining deep industry experience, he founded his own company — IntraMed Solution.",
      ur: "IntraMed Solution ke CEO aur founder Naeem Ahmed sahab hain, jinhein medical devices field mein 15 saal se zyada ka tajurba hai. Unki career journey: unhon ne Verizon se shuruat ki, phir Fazal Din (ek jaana-mana Pakistani pharmacy/healthcare chain) join kiya, phir MediSurg mein Regional Sales Manager ke tor par cardiology devices ke field mein kaam kiya, aur is gehre industry tajurbay ke baad unhon ne apni khud ki company — IntraMed Solution — shuru ki."
    },
    {
      keywords_en: ['how does the stomach work', 'stomach function', 'what is the stomach', 'digestion', 'gastric acid', 'hcl', 'fundus', 'duodenum', 'stomach anatomy'],
      keywords_ur: ['maida kaise kaam', 'hazma', 'maida'],
      en: "The stomach is a J-shaped organ that digests food using gastric acid (HCl) and enzymes. Its main parts are the fundus (upper dome), the body (main digestive area), the antrum (lower narrowing section), and the pylorus (connects to the duodenum, the first part of the small intestine). Endoscopes are used to examine or treat conditions inside the stomach — this is the focus of our Gastroenterology device range.",
      ur: "Maida ek J-shape organ hai jo khane ko gastric acid (HCl) aur enzymes se hazam karta hai. Iske main parts hain: fundus (upar wala dome), body (main digestion wala hissa), antrum (neeche wala narrow hissa), aur pylorus (jo duodenum, yaani small intestine ke pehle hisse se juda hota hai). Endoscope maide ke andar check-up ya ilaj ke liye use hota hai — yehi hamari Gastroenterology devices ki range ka focus hai."
    },
    {
      keywords_en: ['how does the heart work', 'heart function', 'what is the heart', 'ventricle', 'atrium', 'aorta', 'coronary artery', 'heart anatomy', 'circulation'],
      keywords_ur: ['dil kaise kaam', 'dil ka function', 'khoon ki circulation'],
      en: "The heart is a four-chambered pump: two atria (upper chambers, receive blood) and two ventricles (lower chambers, pump blood out). The aorta carries oxygen-rich blood to the body, while the pulmonary artery sends blood to the lungs. Coronary arteries supply blood to the heart muscle itself — when these narrow or block, cardiologists use cath-lab devices and stents to restore blood flow, which is central to our Cardiology device range.",
      ur: "Dil ek chaar-chamber wala pump hai: do atria (upar wale chambers, khoon receive karte hain) aur do ventricles (neeche wale chambers, khoon pump karte hain). Aorta oxygen-rich khoon jism mein bhejta hai, jabke pulmonary artery khoon phaifron (lungs) ki taraf bhejta hai. Coronary arteries dil ke muscle ko khud khoon dete hain — jab yeh tang ya block ho jayein, cardiologists cath-lab devices aur stents se khoon ka behao bahal karte hain, yehi hamari Cardiology devices ki range ka merkaz hai."
    },
    {
      keywords_en: ['how do veins work', 'vein function', 'what is a vein', 'blocked vein', 'vein blockage', 'blood vessel', 'artery vs vein', 'vascular system'],
      keywords_ur: ['vein kaise kaam', 'rag', 'khoon ki nali'],
      en: "Veins carry blood back to the heart, while arteries carry blood away from the heart to the body. When a vein or artery narrows or becomes blocked (often due to plaque buildup), blood flow is restricted. Interventional devices like balloon catheters and self-expanding stents are used to open the blockage and restore normal circulation — this is the focus of our Vascular device range.",
      ur: "Veins khoon ko wapis dil tak le jati hain, jabke arteries khoon ko dil se jism ki taraf le jati hain. Jab kisi vein ya artery mein rukawat (plaque) aa jati hai, khoon ka behao mutasir hota hai. Balloon catheters aur self-expanding stents jaisi interventional devices is blockage ko khol kar normal circulation bahal karti hain — yehi hamari Vascular devices ki range ka focus hai."
    },
    {
      keywords_en: ['how long', 'founded', 'years old', 'when was', 'established', 'history', 'since when'],
      keywords_ur: ['kitne saal', 'kab bani', 'kab shuru', 'kab bana', 'tareekh'],
      en: "IntraMed Solution was founded three years ago by Mr. Naeem Ahmed. Before starting IntraMed, he worked as a Regional Sales Manager at several medical device supplier companies.",
      ur: "IntraMed Solution ko bane teen saal ho chuke hain, jise Naeem Ahmed sahab ne shuru kiya tha. Isse pehle woh kai medical devices supplier companies mein Regional Sales Manager ke tor par kaam kar chuke hain."
    },
    {
      keywords_en: ['delivery time', 'arrive', 'shipping', 'how long will it take', 'reach', 'dispatch', 'when will i get', 'how fast'],
      keywords_ur: ['delivery', 'kitna time', 'kitna waqt', 'kab tak pohanchega', 'kab milega', 'kab ayega'],
      en: "If the order is placed within Lahore, delivery usually takes 3-4 hours, or a bit longer for nearby areas. For orders from other cities, delivery typically takes 24-36 hours.",
      ur: "Agar order Lahore se ho to delivery aam tor par 3-4 ghante mein ho jati hai, qareebi ilaqon ke liye thora zyada waqt lag sakta hai. Doosre shehron se order par delivery mein aam tor par 24-36 ghante lagte hain."
    },
    {
      keywords_en: ['deal', 'partnership', 'work with you', 'collaborate', 'become a supplier', 'distributor', 'reseller', 'tie up'],
      keywords_ur: ['deal', 'partnership', 'kaam kar', 'saath kaam', 'dealership'],
      en: "Yes! Any organization dealing in the same or related medical products is welcome to contact us and explore a partnership with IntraMed Solution.",
      ur: "Bilkul! Koi bhi organization jo isi tarah ke ya milte-julte medical products ka kaam karti hai, hum se rabta kar ke IntraMed Solution ke sath partnership discuss kar sakti hai."
    },
    {
      keywords_en: ['what product', 'category', 'categories', 'what do you supply', 'devices do you', 'what do you sell', 'what do you offer', 'range of products'],
      keywords_ur: ['product', 'kya milta', 'kya supply', 'kya bechte'],
      en: "We supply disposable medical devices across three core specialities: Gastroenterology (ERCP, endoscopy, biopsy forceps, PEG feeding sets), Cardiology (cath-lab & interventional cardiac devices), and Vascular (access sheaths, guidewires, angiography catheters). We stock 16+ device types in total.",
      ur: "Hum teen core specialities mein disposable medical devices supply karte hain: Gastroenterology (ERCP, endoscopy, biopsy forceps, PEG feeding sets), Cardiology (cath-lab aur interventional cardiac devices), aur Vascular (access sheaths, guidewires, angiography catheters). Total milaakar hum 16+ device types stock karte hain."
    },
    {
      keywords_en: ['quotation', 'quote', 'price', 'cost', 'how much', 'rate list', 'pricing'],
      keywords_ur: ['quotation', 'price', 'qeemat', 'rate', 'daam'],
      en: "You can fill out the contact form, call us at 0346 4711440, or send us a message on WhatsApp with your required product list, and we'll send you a quotation within 24 hours.",
      ur: "Aap contact form bhar sakte hain, humein 0346 4711440 par call kar sakte hain, ya WhatsApp par apni required product list bhej sakte hain — hum 24 ghanton ke andar quotation bhej denge."
    },
    {
      keywords_en: ['located', 'location', 'address', 'where are you', 'which city', 'office'],
      keywords_ur: ['kahan hain', 'address', 'location', 'kis shehar'],
      en: "We are based in Lahore, Pakistan, and deliver nationwide across Pakistan.",
      ur: "Hum Lahore, Pakistan mein based hain aur poore Pakistan mein delivery karte hain."
    },
    {
      keywords_en: ['sterile', 'sterility', 'certified', 'certification', 'quality standard', 'regulatory', 'iso', 'safe to use', 'authentic', 'genuine'],
      keywords_ur: ['sterile', 'quality', 'asli', 'certified'],
      en: "All devices supplied by IntraMed Solution are 100% sterile, single-use, and meet international quality and regulatory standards. We source from internationally certified manufacturers and maintain full traceability for each batch.",
      ur: "IntraMed Solution ke tamam devices 100% sterile, single-use hain, aur international quality/regulatory standards ko poora karte hain. Hum internationally certified manufacturers se sourcing karte hain aur har batch ki poori traceability rakhte hain."
    },
    {
      keywords_en: ['single use', 'disposable', 'why disposable', 'reuse'],
      keywords_ur: ['disposable', 'ek bar', 'dobara istemal'],
      en: "Single-use disposable devices eliminate cross-contamination risk, ensure consistent performance, reduce sterilization costs, and support regulatory compliance — critical for patient safety in surgical and interventional procedures.",
      ur: "Single-use disposable devices cross-contamination ka khatra khatam karte hain, consistent performance dete hain, sterilization ki lagat kam karte hain, aur regulatory compliance mein madadgar hain — surgical aur interventional procedures mein patient safety ke liye zaroori."
    },
    {
      keywords_en: ['minimum order', 'moq', 'bulk order', 'bulk discount', 'wholesale', 'large quantity'],
      keywords_ur: ['minimum order', 'bulk', 'zyada quantity'],
      en: "We accommodate both small and bulk orders. Bulk orders receive priority scheduling and volume discounts — contact our team to discuss quantities and pricing for your institution.",
      ur: "Hum chhoti aur bulk dono tarah ki orders leते hain. Bulk orders ko priority scheduling aur volume discounts milte hain — apni quantity aur pricing discuss karne ke liye hamari team se rabta karein."
    },
    {
      keywords_en: ['payment method', 'how do i pay', 'credit terms', 'bank transfer', 'cash on delivery', 'installment'],
      keywords_ur: ['payment', 'kaise paisay', 'credit', 'qist'],
      en: "We offer flexible payment options including cash, bank transfer, and credit arrangements for qualified hospital, surgical center, and clinic customers. Contact our team to discuss terms for your institution.",
      ur: "Hum flexible payment options dete hain — cash, bank transfer, aur credit arrangements (qualified hospitals/clinics ke liye). Apne institution ke liye terms discuss karne ke liye hamari team se rabta karein."
    },
    {
      keywords_en: ['how to order', 'place an order', 'how do i buy', 'how to purchase', 'procurement'],
      keywords_ur: ['order kaise', 'kaise khareedein', 'kharidna'],
      en: "You can place an order by calling us at 0346 4711440, messaging via WhatsApp, or filling out the contact form with your required products. Our team will confirm availability and arrange delivery.",
      ur: "Aap order 0346 4711440 par call kar ke, WhatsApp message kar ke, ya contact form bhar kar de sakte hain. Hamari team availability confirm kar ke delivery arrange kar degi."
    },
    {
      keywords_en: ['phone number', 'contact number', 'call you', 'whatsapp number'],
      keywords_ur: ['phone number', 'number', 'call karna'],
      en: "You can reach us at 0346 4711440 — this number works for calls and WhatsApp.",
      ur: "Aap humein 0346 4711440 par contact kar sakte hain — yeh number call aur WhatsApp dono ke liye kaam karta hai."
    },
    {
      keywords_en: ['email address', 'email id', 'mail you'],
      keywords_ur: ['email', 'mail'],
      en: "You can reach us via the contact form on our website, or call/WhatsApp us at 0346 4711440 for the fastest response.",
      ur: "Aap website ke contact form se, ya sabse tez jawab ke liye 0346 4711440 par call/WhatsApp kar ke humse rabta kar sakte hain."
    },
    {
      keywords_en: ['working hours', 'timing', 'open time', 'closed', 'business hours'],
      keywords_ur: ['timing', 'kab khulte', 'working hours'],
      en: "For working hours and urgent order timing, please call us directly at 0346 4711440 — our team responds quickly to calls and WhatsApp messages.",
      ur: "Working hours aur urgent order timing ke liye seedha 0346 4711440 par call karein — hamari team calls aur WhatsApp messages ka jaldi jawab deti hai."
    },
    {
      keywords_en: ['return policy', 'refund', 'exchange', 'damaged product', 'wrong item'],
      keywords_ur: ['wapsi', 'refund', 'kharab', 'ghalat item'],
      en: "For any issue with a delivered order — damaged items, wrong products, or other concerns — please contact us directly at 0346 4711440 so our team can resolve it quickly.",
      ur: "Delivered order mein koi masla ho (kharab item, ghalat product, ya kuch aur) to seedha 0346 4711440 par contact karein, hamari team jaldi hal kar degi."
    },
    {
      keywords_en: ['manufacturer', 'who makes', 'suppliers do you use', 'source your product', 'where do you import'],
      keywords_ur: ['manufacturer', 'kahan se banta'],
      en: "We partner with internationally certified manufacturers to bring world-class medical devices to healthcare providers across Pakistan, ensuring every product meets rigorous quality and safety standards.",
      ur: "Hum internationally certified manufacturers ke sath partner karte hain taake Pakistan bhar ke healthcare providers ko world-class medical devices mil sakein, aur har product rigorous quality/safety standards poora kare."
    },
    {
      keywords_en: ['why choose', 'why should i', 'what makes you different', 'better than', 'competitor', 'advantage'],
      keywords_ur: ['kyun choose', 'farq', 'khaas baat'],
      en: "IntraMed Solution stands out through ready stock for fast delivery, 100% sterile certified devices, competitive pricing with bulk discounts, and a CEO with 15+ years of hands-on industry experience — we focus on being a dependable, responsive partner for hospitals.",
      ur: "IntraMed Solution ki khaas baatein: ready stock se fast delivery, 100% sterile certified devices, competitive pricing bulk discounts ke sath, aur CEO ka 15+ saal ka industry tajurba — hum hospitals ke liye ek dependable, responsive partner hain."
    },
    {
      keywords_en: ['vision', 'mission', 'goal', 'what do you aim'],
      keywords_ur: ['vision', 'mission', 'maqsad'],
      en: "Our vision is to become Pakistan's leading provider of innovative, reliable medical devices. Our mission is to provide affordable, high-quality, sterile disposable products backed by on-time delivery and attentive service.",
      ur: "Hamara vision Pakistan ka leading medical devices provider banna hai — innovative aur reliable devices ke sath. Hamara mission affordable, high-quality, sterile disposable products dena hai, on-time delivery aur attentive service ke sath."
    },
    {
      keywords_en: ['full catalog', 'see all products', 'product list', 'catalog'],
      keywords_ur: ['poora catalog', 'sari products'],
      en: "You can view our full product catalog on each speciality page — Gastroenterology, Cardiology, or Vascular — linked from the homepage menu.",
      ur: "Hamara poora product catalog aap har speciality page par dekh sakte hain — Gastroenterology, Cardiology, ya Vascular — jo homepage menu se link hai."
    }
  ];
  const FALLBACK = {
    en: "Sorry, I don't have an exact answer for that. Please contact us directly at 0346 4711440 or use the contact form, and our team will help you.",
    ur: "Maazrat, iska exact jawab mere pass nahi hai. Please humein seedha 0346 4711440 par contact karein ya contact form use karein, hamari team madad karegi."
  };
  const URDU_HINT_WORDS = ['kya','hai','hain','kaise','kahan','kab','kitna','kitne','aap','hum','mein','ka','ki','ke','waqt','salam','assalam','aoa','shukriya','madad','sawal','bhej','karein','karte','krna','pesa','paisa','bana','banaya','kaun','kis'];

  function detectUrdu(text) {
    const lower = text.toLowerCase();
    return URDU_HINT_WORDS.some(w => new RegExp('\\b' + w + '\\b').test(lower));
  }

  // Score-based matching: checks EVERY FAQ, counts how many keywords match,
  // and returns the best match — handles different phrasings of the same
  // question much better than "first match wins".
  function findAnswer(text) {
    const lower = ' ' + text.toLowerCase() + ' ';
    const isUrdu = detectUrdu(text);
    let best = null, bestScore = 0;
    for (const faq of FAQS) {
      const list = faq.keywords_en.concat(faq.keywords_ur);
      let score = 0;
      for (const k of list) { if (lower.includes(k.toLowerCase())) score++; }
      if (score > bestScore) { bestScore = score; best = faq; }
    }
    if (best) return isUrdu ? best.ur : best.en;
    return isUrdu ? FALLBACK.ur : FALLBACK.en;
  }

  /* ---------- Build the AI chatbot widget (every page) ---------- */
  const chatWrap = document.createElement('div');
  chatWrap.id = 'imdChatWrap';
  chatWrap.innerHTML = `
    <button type="button" id="imdChatToggle" aria-label="Chat with IntraMed AI">
      <img src="/assets/logo.png" alt="" onerror="this.style.display='none'">
    </button>
    <div id="imdChatPanel">
      <div id="imdChatHead">
        <img src="/assets/logo.png" alt="" onerror="this.style.display='none'">
        <div><b>IntraMed Assistant</b><span>Usually replies instantly</span></div>
        <button type="button" id="imdChatClose" aria-label="Close chat">&times;</button>
      </div>
      <div id="imdChatBody"></div>
      <form id="imdChatForm">
        <input type="text" id="imdChatInput" placeholder="Type your question… / Apna sawal likhein…" autocomplete="off">
        <button type="submit" aria-label="Send">&#10148;</button>
      </form>
    </div>
  `;
  document.body.appendChild(chatWrap);

  const chatBody = chatWrap.querySelector('#imdChatBody');
  function addMsg(text, who) {
    const div = document.createElement('div');
    div.className = 'imd-msg ' + who;
    div.textContent = text;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
  }
  addMsg("Assalam-o-Alaikum! / Hello! Ask me anything about IntraMed Solution.", 'bot');

  chatWrap.querySelector('#imdChatToggle').addEventListener('click', () => chatWrap.classList.toggle('open'));
  chatWrap.querySelector('#imdChatClose').addEventListener('click', () => chatWrap.classList.remove('open'));
  chatWrap.querySelector('#imdChatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = chatWrap.querySelector('#imdChatInput');
    const text = input.value.trim();
    if (!text) return;
    addMsg(text, 'user');
    input.value = '';
    setTimeout(() => addMsg(findAnswer(text), 'bot'), 400);
  });

  /* ---------- WhatsApp floating button — Contact page only, draggable ---------- */
  if (PAGE_NOW === 'contact') {
    const wa = document.createElement('a');
    wa.id = 'imdWhatsappBtn';
    wa.href = 'https://wa.me/923464711440';
    wa.target = '_blank';
    wa.rel = 'noopener';
    wa.setAttribute('aria-label', 'Chat on WhatsApp');
    wa.innerHTML = `<svg viewBox="0 0 24 24" fill="#fff"><path d="M17.6 6.3A8 8 0 004 12a8 8 0 001.2 4.2L4 21l4.9-1.3A8 8 0 1017.6 6.3zM12 18.6a6.5 6.5 0 01-3.3-.9l-.2-.1-2.5.7.7-2.4-.2-.3A6.6 6.6 0 1112 18.6zm3.6-4.9c-.2-.1-1.2-.6-1.4-.6s-.3-.1-.5.1-.6.6-.7.8-.3.2-.5.1a5.3 5.3 0 01-1.6-1 6 6 0 01-1.1-1.4c-.1-.2 0-.3.1-.4l.3-.4.2-.3v-.3l-.5-1.3c-.1-.3-.3-.3-.5-.3h-.4a.8.8 0 00-.6.3 2.4 2.4 0 00-.8 1.8c0 1.1.8 2.1.9 2.3a7.6 7.6 0 003 2.6c.4.2.7.3 1 .4a2.4 2.4 0 001.1.1c.3-.1 1-.4 1.2-.8s.2-.8.1-.9-.2-.1-.3-.2z"/></svg>`;
    document.body.appendChild(wa);

    let dragging = false, offsetX = 0, offsetY = 0, moved = false;
    const startDrag = (clientX, clientY) => {
      dragging = true; moved = false;
      const rect = wa.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      wa.style.transition = 'none';
    };
    const moveDrag = (clientX, clientY) => {
      if (!dragging) return;
      moved = true;
      const x = Math.min(Math.max(0, clientX - offsetX), window.innerWidth - wa.offsetWidth);
      const y = Math.min(Math.max(0, clientY - offsetY), window.innerHeight - wa.offsetHeight);
      wa.style.left = x + 'px';
      wa.style.top = y + 'px';
      wa.style.right = 'auto';
      wa.style.bottom = 'auto';
    };
    const endDrag = () => { dragging = false; wa.style.transition = ''; if (moved) wa.dataset.dragged = '1'; };

    wa.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', endDrag);
    wa.addEventListener('touchstart', (e) => { const t = e.touches[0]; startDrag(t.clientX, t.clientY); }, { passive: true });
    document.addEventListener('touchmove', (e) => { const t = e.touches[0]; moveDrag(t.clientX, t.clientY); }, { passive: true });
    document.addEventListener('touchend', endDrag);
    // If the user just dragged (didn't simply tap), suppress the click so it doesn't open WhatsApp mid-drag.
    wa.addEventListener('click', (e) => { if (wa.dataset.dragged === '1') { e.preventDefault(); wa.dataset.dragged = '0'; } });
  }
})();
