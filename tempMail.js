// ============================================================
// نبيه | البريد المؤقت (mail.tm) — خدمة الخلفية (Service Worker)
// يحمل كـ background.service_worker في manifest.json
// جميع استدعاءات api.mail.tm تمر من هنا فقط.
// متوافق بالكامل مع معايير ومتطلبات Safari على iOS و macOS
// ============================================================

const api = typeof browser !== "undefined" && browser.runtime ? browser : (typeof chrome !== "undefined" ? chrome : self);

const API = "https://api.mail.tm";
const json = { "Content-Type": "application/json" };

function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getStorage(keys) {
  return new Promise((resolve) => {
    try {
      const res = api.storage?.local?.get(keys, (data) => {
        resolve(data || {});
      });
      if (res && typeof res.then === "function") {
        res.then(resolve).catch(() => resolve({}));
      }
    } catch {
      resolve({});
    }
  });
}

function setStorage(items) {
  return new Promise((resolve) => {
    try {
      const res = api.storage?.local?.set(items, () => resolve(true));
      if (res && typeof res.then === "function") {
        res.then(() => resolve(true)).catch(() => resolve(false));
      }
    } catch {
      resolve(false);
    }
  });
}

// إعادة المحاولة مع تأخير متزايد (exponential backoff) للتعامل مع خطأ 429
async function request(path, init = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(API + path, init);
    if (res.ok) return res.json();
    lastErr = new Error("mail.tm " + res.status);
    lastErr.status = res.status;
    if (res.status === 429 && i < tries - 1) {
      // wait 800ms, 1600ms — mail.tm تحد من الطلبات (~8/ثانية/IP)
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

const handlers = {
  async create() {
    const d = await request("/domains");
    const domain = d["hydra:member"].find(x => x.isActive)?.domain
      || d["hydra:member"][0]?.domain;
    if (!domain) throw new Error("لا تتوفر نطاقات بريد حالياً");

    const address = `nabih-${Date.now()}@${domain}`;
    const password = generateUUID();

    await request("/accounts", {
      method: "POST", headers: json,
      body: JSON.stringify({ address, password })
    });

    const tok = await request("/token", {
      method: "POST", headers: json,
      body: JSON.stringify({ address, password })
    });

    // حفظ كل ما نحتاجه: التوكن ينتهي، كلمة المرور تُستخدم لإنشاء توكن جديد
    await setStorage({
      nabihTempMail: address,
      nabihTempToken: tok.token,
      nabihTempId: tok.id,
      nabihTempPassword: password
    });

    return { address, domain };   // تُستخدم في popup.js و content.js
  },

  async inbox() {
    const { nabihTempToken } = await getStorage("nabihTempToken");
    if (!nabihTempToken) throw new Error("لم يتم إنشاء بريد بعد");
    // صفحة واحدة = حتى 30 رسالة (حسب المستند)؛ العدد الكلي في hydra:totalItems
    const box = await request("/messages?page=1", {
      headers: { Authorization: `Bearer ${nabihTempToken}` }
    });
    const member = (box && box["hydra:member"]) || [];
    const total = box && typeof box["hydra:totalItems"] === "number" ? box["hydra:totalItems"] : member.length;
    return {
      full: true,                       // إشارة: هذه ملخصات الصفحة الأولى
      total,                           // العدد الكلي (قد يكون > 30)
      items: member.slice(0, 30).map(m => ({
        id: m.id,
        subject: m.subject || "",
        from: m.from || {},
        seen: !!m.seen,
        intro: m.intro || "",           // مقتطف من النص/الأتش تي ام أل (في الملخص فقط)
        hasAttachments: !!m.hasAttachments,
        createdAt: m.createdAt || "",
        isDeleted: !!m.isDeleted
      }))
    };
  },

  async read({ id }) {
    const { nabihTempToken } = await getStorage("nabihTempToken");
    if (!nabihTempToken) throw new Error("لم يتم إنشاء بريد بعد");
    const full = await request(`/messages/${id}`, {
      headers: { Authorization: `Bearer ${nabihTempToken}` }
    });

    // html قد يكون مصفوفة من السلاسل (حسب المستند) — ندمجه كنص واحد
    const htmlArr = Array.isArray(full.html) ? full.html : (full.html ? [full.html] : []);
    const html = htmlArr.join("\n");
    const text = full.text || "";

    // روابط التحقق: من الأتش تي ام أولاً (href)، ثم من النص (عنوان كامل)
    const out = [];
    const seen = new Set();
    const add = (u) => {
      try { const x = String(u); if (!x || x.startsWith("#") || x.startsWith("mailto:")) return; new URL(x); } catch { return; }
      if (!seen.has(u)) { seen.add(u); out.push(u); }
    };
    (html.match(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi) || [])
      .map(a => { const m = a.match(/href\s*=\s*["']([^"']+)["']/i); return m ? m[1] : ""; }).filter(Boolean).forEach(add);
    (html.match(/https?:\/\/[^\\<"'\s]+/g) || []).forEach(add);   // \  للـ escape داخل النمط
    (text.match(/https?:\/\/[^\s<>"']+/g) || []).forEach(add);

    // كود التحقق (OTP): رقم 4-8 خانات، نستبعد الأرقام التي داخل روابط التحقق
    // (توكن الرابط ليس كوداً) — الأولوية لـ 4-6 خانات لأنها الأشيع لـ OTP
    let code = null;
    const linkBlob = out.join("\n");
    const tokens = [...new Set((text.match(/\b\d{4,8}\b/g) || []).filter(t => !linkBlob.includes(t)))];
    code = tokens.find(t => /^\d{4,6}$/.test(t)) || tokens.find(t => /^\d{7,8}$/.test(t)) || null;

    return {
      ...full,
      html, text,          // html نصي متصل (وليس مصفوفة)، يسهل عرضه وتصفحه
      intro: full.intro || "",
      links: out,          // كل الروابط المطلقة (الأتش تي ام أولاً)
      code                 // كود التحقق المستخلص، أو null
    };
    // -> { text, html, links, code, intro, subject, from, attachments, verifications, ... }
  },

  async remove({ id }) {
    const { nabihTempToken } = await getStorage("nabihTempToken");
    if (!nabihTempToken) throw new Error("لم يتم إنشاء بريد بعد");
    return fetch(API + `/messages/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${nabihTempToken}` }
    });
  }
};

api.runtime?.onMessage?.addListener((msg, sender, done) => {
  (handlers[msg?.type]?.(msg) ?? Promise.reject(new Error("أمر غير معروف")))
    .then(data => done({ ok: true, data }))
    .catch(err => done({ ok: false, error: err.message, status: err.status }));
  return true;   // إبقاء قناة الرسائل مفتوحة للرد غير المتزامن
});
