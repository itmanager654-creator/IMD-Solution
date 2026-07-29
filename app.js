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
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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
const storage = getStorage(app);
const analytics = getAnalytics(app);
const INQUIRIES_COL = collection(db, "inquiries");

setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});

const CONTENT_DOC = doc(db, "intramed", "content");
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
    { title: "Gastroenterology Devices", desc: "Guide wires, sphincterotomes, biopsy forceps and PEG feeding sets for endoscopic and ERCP procedures.", link: "gastroenterology.html" },
    { title: "Cardiology Devices", desc: "Disposable cardiology devices for cath-lab and interventional cardiac procedures across Pakistan.", link: "cardiology.html" },
    { title: "Vascular Devices", desc: "Peripheral vascular disposables supporting interventional and vascular access procedures.", link: "vascular.html" }
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
  contact: {
    name: "Naeem Ahmed", role: "CEO, INTRAMED SOLUTION",
    email: "info@intramedsolution.com", phone: "0346 4711440", address: "Lahore, Pakistan"
  }
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
  const icons = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 12c2-4 4-6 6 0s4 4 6 0 3-6 4-2"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M6 3v6l3 3-3 3v6M18 3v6l-3 3 3 3v6"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M8 8v13M16 8v13M4 8l2-5h12l2 5"/></svg>'
  ];
  grid.innerHTML = siteData.categories.map((c, i) => `
    <a href="${c.link || '#'}" class="cat-card reveal in" style="display:block;">
      <div class="cat-icon">${icons[i] || icons[0]}</div>
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
      <div class="prod-media">${genericIcon}</div>
      <div class="prod-body">
        <span class="prod-tag">${p.tag}</span>
        <h4>${p.title}</h4>
        <p>${p.desc}</p>
      </div>
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
    <tr><td class="sr">${i + 1}</td><td>${row.name}</td><td class="spec">${row.spec}</td></tr>
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
  renderCategoryCatalog();
}
renderAll();

/* ---------------- LIVE SYNC (every page) ---------------- */
onSnapshot(CONTENT_DOC, (snap) => {
  if (snap.exists()) {
    siteData = mergeWithDefaults(snap.data());
    renderAll();
    if (isAdmin) populateAdminLists();
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
  }
}

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
  function openAdminEntry() {
    if (mobileNav) mobileNav.classList.remove('open');
    if (isAdmin) {
      populateAdminLists();
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
  document.getElementById('closeDashBtn').addEventListener('click', () => adminDashOverlay.classList.remove('open'));

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
    if (isAdmin) {
      document.getElementById('loginError').classList.remove('show');
      document.getElementById('adminLoginForm').reset();
      adminLoginOverlay.classList.remove('open');
      const snap = await getDoc(CONTENT_DOC);
      if (!snap.exists()) await setDoc(CONTENT_DOC, DEFAULT_DATA);
      populateAdminLists();
      adminDashOverlay.classList.add('open');
    }
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
    await signOut(auth);
    adminDashOverlay.classList.remove('open');
  });

  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'tabInquiries') loadInquiries();
    });
  });

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
    } catch (err) {
      console.error('Failed to load inquiries:', err);
      list.innerHTML = '<div class="ali-text"><span>Could not load messages. Check Firestore rules/connection.</span></div>';
    }
  }
  document.getElementById('refreshInquiriesBtn').addEventListener('click', loadInquiries);

  function populateAdminLists() {
    const catList = document.getElementById('catalogAdminList');
    catList.innerHTML = siteData.catalog.length ? siteData.catalog.map((row, i) => `
      <div class="admin-list-item">
        <div class="ali-text"><b>${row.name}</b><span>${row.category || 'Gastroenterology'} \u2014 ${row.spec}</span></div>
        <button class="admin-del-btn" data-type="catalog" data-index="${i}">\u2715</button>
      </div>`).join('') : '<div class="admin-empty">No catalog items yet.</div>';

    const featList = document.getElementById('featuredAdminList');
    featList.innerHTML = siteData.featured.length ? siteData.featured.map((p, i) => `
      <div class="admin-list-item">
        <div class="ali-text"><b>${p.title}</b><span>${p.tag} \u2014 ${p.desc}</span></div>
        <button class="admin-del-btn" data-type="featured" data-index="${i}">\u2715</button>
      </div>`).join('') : '<div class="admin-empty">No featured products yet.</div>';

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
        if (type === 'partner') siteData.partners.splice(idx, 1);
        if (type === 'client') siteData.clients.splice(idx, 1);
        renderAll();
        populateAdminLists();
        await saveToCloud();
      });
    });
  }

  async function uploadLogo(file, folder) {
    if (!file) return "";
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `public/${folder}/${Date.now()}_${safeName}`;
    const fileRef = ref(storage, path);
    const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: upload took too long \u2014 check Firebase Storage rules/connection')), ms));
    await Promise.race([
      uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' }),
      timeout(30000)
    ]);
    return await getDownloadURL(fileRef);
  }

  document.getElementById('catalogAddForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('catName').value.trim();
    const spec = document.getElementById('catSpec').value.trim();
    const category = document.getElementById('catCategory').value;
    if (!name || !spec) return;
    siteData.catalog.push({ name, spec, category });
    e.target.reset();
    renderAll(); populateAdminLists();
    await saveToCloud();
  });

  document.getElementById('featuredAddForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tag = document.getElementById('featTag').value.trim();
    const title = document.getElementById('featTitle').value.trim();
    const desc = document.getElementById('featDesc').value.trim();
    if (!tag || !title || !desc) return;
    siteData.featured.push({ tag, title, desc });
    e.target.reset();
    renderAll(); populateAdminLists();
    await saveToCloud();
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
      { title: el('editCat1Title').value.trim() || siteData.categories[0]?.title || "", desc: el('editCat1Desc').value.trim() || siteData.categories[0]?.desc || "", link: siteData.categories[0]?.link || "gastroenterology.html" },
      { title: el('editCat2Title').value.trim() || siteData.categories[1]?.title || "", desc: el('editCat2Desc').value.trim() || siteData.categories[1]?.desc || "", link: siteData.categories[1]?.link || "cardiology.html" },
      { title: el('editCat3Title').value.trim() || siteData.categories[2]?.title || "", desc: el('editCat3Desc').value.trim() || siteData.categories[2]?.desc || "", link: siteData.categories[2]?.link || "vascular.html" }
    ];
    renderAll();
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
    await saveToCloud();
  });
}
