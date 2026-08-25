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
// populateAdminLists() itself is defined inside the admin-only block further
// down (it touches admin-dashboard-only DOM), but the Firestore listeners
// above need to call it too. This gets assigned once that block runs, and
// every call site below checks it's actually set before using it — avoids
// a "populateAdminLists is not defined" crash on every sync while logged in.
let refreshAdminUI = null;

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

/* ---------------- DEFAULT DATA ----------------
   IMPORTANT (Aug 2026 storage migration): catalog / gallery / featured /
   partners / clients used to live as arrays INSIDE the single "intramed/content"
   document. That document has Firestore's 1MB hard size cap, and once enough
   products + photos were added it started rejecting every new save with
   "invalid-argument". Those five now live in their OWN Firestore collections
   (one document per item), so each save is tiny and the cap is effectively
   gone. DEFAULT_CONTENT below is ONLY the small text fields that still live
   in the shared content document. */
const DEFAULT_CONTENT = {
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
  contact: {
    name: "Naeem Ahmed", role: "CEO, INTRAMED SOLUTION",
    email: "info@intramedsolution.com", phone: "0346 4711440", address: "Lahore, Pakistan"
  },
  // Emails / phone numbers blocked from submitting the contact form.
  blockedContacts: []
};

// Used only as a starting point before the very first Firestore snapshot
// arrives for each collection (or if a collection is genuinely empty).
const EMPTY_COLLECTIONS = { catalog: [], gallery: [], featured: [], partners: [], clients: [] };
// Kept ONLY so a brand-new, never-before-seeded Firebase project can bootstrap
// a starter catalog. Existing sites should never see this used.
const STARTER_CATALOG = [
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
];

let siteData = {
  ...JSON.parse(JSON.stringify(DEFAULT_CONTENT)),
  ...JSON.parse(JSON.stringify(EMPTY_COLLECTIONS))
};

function mergeWithDefaults(data) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_CONTENT));
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
  grid.innerHTML = items.map((g, i) => `
    <div class="prod-card reveal in" data-lb-index="${i}" style="cursor:zoom-in;">
      <div class="prod-media"><img src="${g.imgUrl}" alt="${g.caption || (wanted + ' Lahore')}" loading="lazy" style="width:100%;height:100%;object-fit:contain;"></div>
      ${g.caption ? `<div class="prod-body"><p>${g.caption}</p></div>` : ''}
    </div>
  `).join('');
  grid.querySelectorAll('.prod-card').forEach(card => {
    card.addEventListener('click', () => openLightbox(items, Number(card.dataset.lbIndex)));
  });
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
      <td class="cat-photo">${row.imgUrl ? `<img src="${row.imgUrl}" alt="${row.name} – ${wanted} Lahore" loading="lazy" width="56" height="56" style="width:56px;height:56px;object-fit:cover;border-radius:8px;">` : ''}</td>
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
    "name": categoryName + " Catalog",
    "itemListElement": rows.map((row, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "Thing",
        "name": row.name,
        "description": row.spec,
        "category": categoryName,
        "image": row.imgUrl || undefined
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

/* ---------------- STANDALONE GALLERY PAGE (all categories, with filter tabs) ---------------- */
function renderFullGallery() {
  const grid = document.getElementById('fullGalleryGrid');
  if (!grid) return;
  const empty = document.getElementById('fullGalleryEmpty');
  const items = siteData.gallery || [];

  function paint(filter) {
    const filtered = filter === 'All' ? items : items.filter(g => g.category === filter);
    if (!filtered.length) {
      grid.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = filtered.map((g, i) => `
      <div class="prod-card reveal in" data-lb-index="${i}" style="cursor:zoom-in;">
        <div class="prod-media"><img src="${g.imgUrl}" alt="${g.caption || (g.category + ' - Medical Devices Lahore')}" loading="lazy" style="width:100%;height:100%;object-fit:contain;"></div>
        <div class="prod-body">
          ${g.caption ? `<p>${g.caption}</p>` : ''}
          <span class="gallery-tag">${g.category}</span>
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('.prod-card').forEach(card => {
      card.addEventListener('click', () => openLightbox(filtered, Number(card.dataset.lbIndex)));
    });
  }

  paint('All');
  document.querySelectorAll('.gallery-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gallery-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      paint(btn.dataset.filter);
    });
  });
}

/* ---------------- PHOTO LIGHTBOX (full-size viewer with prev/next, every page) ---------------- */
let lightboxItems = [];
let lightboxIndex = 0;
function ensureLightbox() {
  if (document.getElementById('imdLightbox')) return;
  const style = document.createElement('style');
  style.textContent = `
    .imd-lightbox{ position:fixed; inset:0; background:rgba(8,8,8,0.94); z-index:10000; display:none; align-items:center; justify-content:center; padding:50px 20px; }
    .imd-lightbox.open{ display:flex; }
    .imd-lb-figure{ display:flex; flex-direction:column; align-items:center; max-width:92vw; }
    .imd-lb-img{ max-width:92vw; max-height:78vh; object-fit:contain; border-radius:10px; box-shadow:0 20px 60px rgba(0,0,0,0.6); background:#141414; }
    .imd-lb-caption{ color:#f4f4f4; margin-top:16px; font-size:14.5px; text-align:center; max-width:640px; }
    .imd-lb-count{ color:rgba(255,255,255,0.55); font-size:12.5px; margin-top:6px; }
    .imd-lb-btn{ position:absolute; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.28); color:#fff; width:44px; height:44px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .2s ease; }
    .imd-lb-btn:hover{ background:rgba(255,255,255,0.24); }
    .imd-lb-btn svg{ width:20px; height:20px; }
    .imd-lb-close{ top:20px; right:20px; }
    .imd-lb-prev{ left:16px; top:50%; transform:translateY(-50%); }
    .imd-lb-next{ right:16px; top:50%; transform:translateY(-50%); }
    @media (max-width:640px){ .imd-lb-prev{ left:8px; } .imd-lb-next{ right:8px; } .imd-lb-btn{ width:38px; height:38px; } }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'imd-lightbox';
  wrap.id = 'imdLightbox';
  wrap.innerHTML = `
    <button type="button" class="imd-lb-btn imd-lb-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    <button type="button" class="imd-lb-btn imd-lb-prev" aria-label="Previous photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
    <div class="imd-lb-figure">
      <img class="imd-lb-img" src="" alt="">
      <div class="imd-lb-caption"></div>
      <div class="imd-lb-count"></div>
    </div>
    <button type="button" class="imd-lb-btn imd-lb-next" aria-label="Next photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>
  `;
  document.body.appendChild(wrap);

  wrap.querySelector('.imd-lb-close').addEventListener('click', closeLightbox);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeLightbox(); });
  wrap.querySelector('.imd-lb-prev').addEventListener('click', () => stepLightbox(-1));
  wrap.querySelector('.imd-lb-next').addEventListener('click', () => stepLightbox(1));
  document.addEventListener('keydown', (e) => {
    if (!wrap.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  });
}
function paintLightbox() {
  const wrap = document.getElementById('imdLightbox');
  if (!wrap || !lightboxItems.length) return;
  const item = lightboxItems[lightboxIndex];
  wrap.querySelector('.imd-lb-img').src = item.imgUrl;
  wrap.querySelector('.imd-lb-img').alt = item.caption || item.category || 'Photo';
  wrap.querySelector('.imd-lb-caption').textContent = item.caption || '';
  wrap.querySelector('.imd-lb-count').textContent = lightboxItems.length > 1 ? `${lightboxIndex + 1} / ${lightboxItems.length}` : '';
  const multi = lightboxItems.length > 1;
  wrap.querySelector('.imd-lb-prev').style.display = multi ? '' : 'none';
  wrap.querySelector('.imd-lb-next').style.display = multi ? '' : 'none';
}
function openLightbox(items, index) {
  ensureLightbox();
  lightboxItems = items;
  lightboxIndex = index;
  paintLightbox();
  document.getElementById('imdLightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  const wrap = document.getElementById('imdLightbox');
  if (wrap) wrap.classList.remove('open');
  document.body.style.overflow = '';
}
function stepLightbox(dir) {
  if (!lightboxItems.length) return;
  lightboxIndex = (lightboxIndex + dir + lightboxItems.length) % lightboxItems.length;
  paintLightbox();
}

function renderAll() {
  renderHero(); renderAbout(); renderVisionMission(); renderCategories();
  renderFeatured(); renderPartners(); renderClients(); renderContactInfo();
  renderCategoryCatalog(); renderGallery(); renderFullGallery();
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

// 2) Firestore keeps everything live.
// The small "intramed/content" doc holds only text (hero/about/vision/
// mission/categories/contact/blockedContacts) — never images — so it never
// comes close to the 1MB cap.
onSnapshot(CONTENT_DOC, (snap) => {
  if (snap.exists()) {
    const merged = mergeWithDefaults(snap.data());
    siteData = { ...siteData, ...merged };
    renderAll();
    saveLocalCache();
    if (isAdmin && refreshAdminUI) refreshAdminUI();
  } else if (isAdmin) {
    // Extremely rare: the content doc genuinely doesn't exist yet (fresh
    // Firebase project). Only an authenticated admin can create it —
    // regular visitors just see the built-in DEFAULT_CONTENT.
    setDoc(CONTENT_DOC, DEFAULT_CONTENT).catch(err => console.error('Bootstrap write failed:', err));
    // Fresh project, no catalog yet either — seed a starting catalog so the
    // site isn't empty. Existing sites never hit this (their catalog
    // collection already has documents).
    getDocs(collection(db, 'catalog')).then(catSnap => {
      if (catSnap.empty) {
        STARTER_CATALOG.forEach(item => {
          addDoc(collection(db, 'catalog'), { ...item, imgUrl: '', createdAt: serverTimestamp() })
            .catch(err => console.error('Starter catalog seed failed:', err));
        });
      }
    }).catch(err => console.error('Starter catalog check failed:', err));
  }
}, (err) => {
  console.error("Firestore sync error:", err);
});

// catalog / gallery / featured / partners / clients each live in their OWN
// collection now (one Firestore document per item, each with its own
// auto-generated id) — this is what fixes the old "invalid-argument" /
// document-too-large crash for good: every add/delete only ever touches
// ONE small item document, never a single shared multi-MB blob.
const COLLECTION_NAMES = ['catalog', 'gallery', 'featured', 'partners', 'clients'];
function watchCollection(name) {
  onSnapshot(collection(db, name), (snap) => {
    siteData[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
    saveLocalCache();
    if (isAdmin && refreshAdminUI) refreshAdminUI();
  }, (err) => {
    console.error(`Firestore ${name} sync error:`, err);
  });
}
COLLECTION_NAMES.forEach(watchCollection);

// Saves ONLY the small text fields back to the shared content document.
// catalog/gallery/featured/partners/clients are never written here — each
// of those is added/removed one document at a time (see addDoc/deleteDoc
// calls further below), which is what keeps this document small forever.
async function saveToCloud() {
  const syncStatus = document.getElementById('syncStatus');
  const slim = {
    hero: siteData.hero, about: siteData.about, vision: siteData.vision, mission: siteData.mission,
    categories: siteData.categories, contact: siteData.contact, blockedContacts: siteData.blockedContacts || []
  };
  try {
    await setDoc(CONTENT_DOC, slim);
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

// Instantly reflects an add/delete in the UI instead of waiting for the
// Firestore listener's round trip. The onSnapshot listener still fires
// afterwards and reconciles siteData[name] with the server's copy (full
// replace, so this never causes a duplicate) — this just removes the visible
// lag the admin was seeing where a new photo/product only appeared after
// logging out and back in.
// (Defined further below, inside the admin-only block, so it can see
// populateAdminLists() — see addItemOptimistic / deleteItemOptimistic there.)

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
  // Function declarations are hoisted within this block, so populateAdminLists
  // (defined further down) is already callable here — this is what lets the
  // module-level Firestore listeners safely refresh the admin UI.
  refreshAdminUI = populateAdminLists;

  // True when this copy of index.html is running inside the "View Live Site"
  // preview iframe. In that case we must never auto-open the login/dashboard
  // overlay, even though Firebase Auth will report the admin as logged in
  // (the iframe shares sessionStorage with the parent dashboard tab).
  const isPreviewFrame = new URLSearchParams(window.location.search).get('preview') === '1';

  // One-time bulk helper — run from browser console while logged in as admin:
  // __bulkAddCatalog([{name:"...", spec:"..."}, ...], "Gastroenterology")
  // Replaces all rows of that category in one go — no need to use the Add form 16 times.
  window.__bulkAddCatalog = async function (items, category) {
    const existing = siteData.catalog.filter(r => r.category === category);
    for (const row of existing) {
      if (row.id) await deleteDoc(doc(db, 'catalog', row.id));
    }
    for (const it of items) {
      await addDoc(collection(db, 'catalog'), { name: it.name, spec: it.spec, category, imgUrl: it.imgUrl || '', createdAt: serverTimestamp() });
    }
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

  /* ---------------- ONE-TIME STORAGE MIGRATION ----------------
     Old sites had catalog/gallery/featured/partners/clients as arrays
     INSIDE the single "intramed/content" document — that's what hit
     Firestore's 1MB cap and started throwing "invalid-argument" on every
     new photo. This copies each array item into its own small document in
     a proper collection, THEN clears those arrays from the content doc.
     Safe by design: the content doc is only touched at the very end, after
     every item has been copied successfully — if anything fails partway,
     your original data is untouched and nothing is lost. */
  async function migrateToCollections() {
    const statusEl = document.getElementById('migrateStatus');
    const btn = document.getElementById('migrateBtn');
    const setStatus = (msg) => { if (statusEl) { statusEl.textContent = msg; statusEl.classList.add('show'); } };
    if (btn) btn.disabled = true;
    setStatus('Checking current data\u2026');
    try {
      const snap = await getDoc(CONTENT_DOC);
      const data = snap.exists() ? snap.data() : {};
      const names = ['catalog', 'gallery', 'featured', 'partners', 'clients'];

      // Guard against double-migration: if the new collections already have
      // documents AND the old doc still has arrays too, ask before continuing.
      const alreadyMigratedAny = names.some(n => Array.isArray(siteData[n]) && siteData[n].length && siteData[n].every(x => x.id));
      const oldArraysPresent = names.some(n => Array.isArray(data[n]) && data[n].length);
      if (!oldArraysPresent) {
        setStatus('Nothing to migrate \u2014 old document has no catalog/gallery/featured/partners/clients arrays left. You\u2019re already on the new storage.');
        if (btn) { btn.textContent = 'Already migrated'; }
        return;
      }
      if (alreadyMigratedAny) {
        if (!confirm('Some items already exist in the new storage. Running this again may create duplicates. Continue anyway?')) {
          if (btn) btn.disabled = false;
          setStatus('Migration cancelled.');
          return;
        }
      }

      const counts = {};
      for (const name of names) {
        const items = Array.isArray(data[name]) ? data[name] : [];
        counts[name] = 0;
        for (const item of items) {
          const { id, ...fields } = item; // drop any stray legacy id field
          setStatus(`Copying ${name}\u2026 (${counts[name] + 1}/${items.length})`);
          await addDoc(collection(db, name), { ...fields, migratedAt: serverTimestamp() });
          counts[name]++;
        }
      }

      // Everything copied successfully — now shrink the old shared document
      // down to just the small text fields it should have held all along.
      setStatus('Finishing up\u2026');
      const slim = {
        hero: data.hero || DEFAULT_CONTENT.hero,
        about: data.about || DEFAULT_CONTENT.about,
        vision: data.vision || DEFAULT_CONTENT.vision,
        mission: data.mission || DEFAULT_CONTENT.mission,
        categories: data.categories || DEFAULT_CONTENT.categories,
        contact: data.contact || DEFAULT_CONTENT.contact,
        blockedContacts: data.blockedContacts || []
      };
      await setDoc(CONTENT_DOC, slim);

      setStatus(`Done! Copied ${counts.catalog} catalog items, ${counts.gallery} photos, ${counts.featured} featured products, ${counts.partners} partners, ${counts.clients} clients. Photo uploads are fixed \u2014 try adding one now.`);
      if (btn) { btn.textContent = 'Migration complete \u2713'; }
    } catch (err) {
      console.error('Migration failed:', err);
      setStatus('Migration failed: ' + ((err && (err.code || err.message)) || 'unknown error') + '. Nothing was deleted \u2014 your original data is safe. Please try again.');
      if (btn) btn.disabled = false;
    }
  }
  const migrateBtn = document.getElementById('migrateBtn');
  if (migrateBtn) {
    migrateBtn.addEventListener('click', () => {
      if (!confirm('This copies your existing catalog, photos, featured products, partners and clients into the new storage (fixing the upload-failed error), then clears them from the old shared document. Your data is not deleted at any point until each copy is confirmed. Please don\u2019t close this tab while it runs. Continue?')) return;
      migrateToCollections();
    });
  }
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

  // Instantly reflects an add/delete in the UI instead of waiting for the
  // Firestore listener's round trip. The onSnapshot listener still fires
  // afterwards and reconciles siteData[name] with the server's copy (full
  // replace, so this never causes a duplicate) — this just removes the
  // visible lag where a new photo/product only appeared after logging out
  // and back in.
  async function addItemOptimistic(name, fields) {
    const ref = await addDoc(collection(db, name), { ...fields, createdAt: serverTimestamp() });
    siteData[name] = [...siteData[name], { id: ref.id, ...fields }];
    renderAll();
    saveLocalCache();
    populateAdminLists();
    return ref;
  }
  async function deleteItemOptimistic(name, id) {
    await deleteDoc(doc(db, name, id));
    siteData[name] = siteData[name].filter(item => item.id !== id);
    renderAll();
    saveLocalCache();
    populateAdminLists();
  }

  function populateAdminLists() {
    renderAdminQuickStats();
    renderBlockedUsersList();
    const catList = document.getElementById('catalogAdminList');
    // Only show rows matching the active filter tab (All / Gastroenterology /
    // Cardiology / Vascular). Each row now carries its real Firestore doc id
    // (via data-id) so delete always targets the correct document.
    const filteredEntries = siteData.catalog
      .filter((row) => catalogFilter === 'All' || (row.category || 'Gastroenterology') === catalogFilter);
    catList.innerHTML = filteredEntries.length ? filteredEntries.map((row) => `
      <div class="admin-list-item">
        ${row.imgUrl ? `<img src="${row.imgUrl}" alt="" loading="lazy" style="height:32px;width:32px;object-fit:cover;border-radius:6px;margin-right:10px;">` : ''}
        <div class="ali-text"><b>${row.name}</b><span>${row.category || 'Gastroenterology'} \u2014 ${row.spec}</span></div>
        <button class="admin-del-btn" data-type="catalog" data-id="${row.id}">\u2715</button>
      </div>`).join('') : `<div class="admin-empty">No ${catalogFilter === 'All' ? 'catalog items' : catalogFilter + ' products'} yet.</div>`;

    const featList = document.getElementById('featuredAdminList');
    featList.innerHTML = siteData.featured.length ? siteData.featured.map((p) => `
      <div class="admin-list-item">
        ${p.imgUrl ? `<img src="${p.imgUrl}" alt="" loading="lazy" style="height:32px;width:32px;object-fit:cover;border-radius:6px;margin-right:10px;">` : ''}
        <div class="ali-text"><b>${p.title}</b><span>${p.tag} \u2014 ${p.desc}</span></div>
        <button class="admin-del-btn" data-type="featured" data-id="${p.id}">\u2715</button>
      </div>`).join('') : '<div class="admin-empty">No featured products yet.</div>';

    const galList = document.getElementById('galleryAdminList');
    if (galList) {
      const gallery = siteData.gallery || [];
      galList.innerHTML = gallery.length ? gallery.map((g) => `
        <div class="admin-list-item">
          <img src="${g.imgUrl}" alt="" loading="lazy" style="height:32px;width:32px;object-fit:cover;border-radius:6px;margin-right:10px;">
          <div class="ali-text"><b>${g.category}</b><span>${g.caption || ''}</span></div>
          <button class="admin-del-btn" data-type="gallery" data-id="${g.id}">\u2715</button>
        </div>`).join('') : '<div class="admin-empty">No product photos yet.</div>';
    }

    const partList = document.getElementById('partnersAdminList');
    partList.innerHTML = siteData.partners.length ? siteData.partners.map((p) => `
      <div class="admin-list-item">
        <div class="ali-text"><b>${p.name}</b><span>${p.desc}</span></div>
        <button class="admin-del-btn" data-type="partner" data-id="${p.id}">\u2715</button>
      </div>`).join('') : '<div class="admin-empty">No partners yet.</div>';

    const clientList = document.getElementById('clientsAdminList');
    clientList.innerHTML = siteData.clients.length ? siteData.clients.map((c) => `
      <div class="admin-list-item">
        ${c.logoUrl ? `<img src="${c.logoUrl}" alt="" loading="lazy" style="height:32px;width:auto;max-width:90px;object-fit:contain;margin-right:10px;">` : ''}
        <div class="ali-text"><b>${c.label || 'Client logo'}</b></div>
        <button class="admin-del-btn" data-type="client" data-id="${c.id}">\u2715</button>
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

  const COLLECTION_FOR_TYPE = { catalog: 'catalog', featured: 'featured', gallery: 'gallery', partner: 'partners', client: 'clients' };
  function attachDeleteHandlers() {
    document.querySelectorAll('.admin-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        const id = btn.dataset.id;
        const colName = COLLECTION_FOR_TYPE[type];
        if (!colName || !id) return;
        btn.disabled = true;
        try {
          await deleteItemOptimistic(colName, id);
        } catch (err) {
          console.error(`Delete ${type} failed:`, err);
          alert('Could not delete: ' + ((err && (err.code || err.message)) || 'unknown error'));
          btn.disabled = false;
        }
      });
    });
  }

  // Images are stored as compressed base64 directly in Firestore (no Firebase
  // Storage / Blaze plan needed). Resized + JPEG-compressed client-side to
  // keep the single shared content document well under Firestore's 1MB cap.
  // Aug 2026: was temporarily dropped to 720/0.6 as an emergency fix while
  // everything still shared one 1MB Firestore document. Now that catalog/
  // gallery/featured/partners/clients each live in their own collection
  // (one small document per item), that pressure is gone — back to good
  // visual quality. A typical compressed photo at these settings is still
  // comfortably a few hundred KB, well under any per-document limit.
  function compressImageToDataUrl(file, maxDim = 1280, quality = 0.82) {
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
      await addItemOptimistic('catalog', { name, spec, category, imgUrl });
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
      await addItemOptimistic('featured', { tag, title, desc, imgUrl });
      e.target.reset();
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
      await addItemOptimistic('gallery', { imgUrl, category, caption });
      e.target.reset();
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
      await addItemOptimistic('partners', { name, desc, logoUrl });
      e.target.reset();
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
      await addItemOptimistic('clients', { label: '', logoUrl });
      e.target.reset();
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

/* ================= WHATSAPP BUTTON (contact page only) ================= */
(function initFloatingWidgets() {
  const PAGE_NOW = document.body.dataset.page || 'home';

  // Inject CSS directly (avoids any stylesheet-caching issues — only app.js
  // needs to be re-uploaded for this widget to work everywhere).
  const style = document.createElement('style');
  style.textContent = `
    #imdWhatsappBtn{
      position:fixed; right:22px; bottom:22px; z-index:9998; width:56px; height:56px; border-radius:50%;
      background:#25D366; display:flex; align-items:center; justify-content:center; cursor:grab;
      box-shadow:0 10px 26px rgba(37,211,102,.4); touch-action:none;
    }
    #imdWhatsappBtn svg{ width:30px; height:30px; }
    #imdWhatsappBtn:active{ cursor:grabbing; }
  `;
  document.head.appendChild(style);

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
