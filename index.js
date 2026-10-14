/* Naya inquiry (Firestore: inquiries/{id}) aate hi saare admin devices
   ko push notification bhejta hai. Tokens `adminTokens` collection mein hain. */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

// Yeh region aap ke Firestore database ki location ke barabar honi chahiye
// (Firebase Console > Firestore Database > Data tab par location likhi hoti hai).
const REGION = "us-central1";
const SITE = "https://www.intramedsolution.com";

exports.notifyNewInquiry = onDocumentCreated(
  { document: "inquiries/{id}", region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const v = snap.data() || {};

    const db = getFirestore();
    const tokenSnap = await db.collection("adminTokens").get();
    const tokens = tokenSnap.docs.map((d) => d.id);
    if (!tokens.length) return;

    const msg = String(v.message || "").replace(/\s+/g, " ").trim();
    const data = {
      title: "New inquiry: " + (v.name || "Website visitor"),
      body: [v.phone, msg.length > 100 ? msg.slice(0, 100) + "\u2026" : msg].filter(Boolean).join(" \u2014 "),
      url: SITE + "/#admin"
    };

    const dead = [];
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      const res = await getMessaging().sendEachForMulticast({
        tokens: chunk,
        data,
        webpush: { headers: { Urgency: "high", TTL: "86400" } }
      });
      res.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error && r.error.code;
          if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
            dead.push(chunk[idx]);
          } else {
            console.error("Push failed:", code);
          }
        }
      });
    }

    // Purane / expired tokens saaf kar do.
    await Promise.all(dead.map((t) => db.collection("adminTokens").doc(t).delete()));
  }
);
