// ============================================================
// نبيه | البريد المؤقت (mail.tm) — خدمة الخلفية (Service Worker)
// يحمل كـ background.service_worker في manifest.json
// جميع استدعاءات api.mail.tm تمر من هنا فقط.
//
// إصلاحات هذا الإصدار:
//  • التوكن ينتهي صلاحيته: أي طلب يرجع 401 يجدّد التوكن تلقائياً
//    من كلمة المرور المحفوظة ثم يعيد المحاولة (بدون أن يفقد الصندوق).
//  • الصندوق كان يجلب الصفحة الأولى فقط (30 رسالة) → الآن يجلب كل
//    الصفحات المتاحة ويرجع العدد الكامل hydra:totalItems.
//  • read() يرجع html/text كاملين + المرفقات + يوسّم الرسالة كمقروءة.
// ============================================================

const API = "https://api.mail.tm";
const JSON_HEADERS = { "Content-Type": "application/json" };
const MAX_INBOX_PAGES = 5;      // 5 × 30 = 150 رسالة كحدٍ أعلى

// إعادة المحاولة مع تأخير متزايد (exponential backoff) للتعامل مع خطأ 429
async function request(path, init = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(API + path, init);
    if (res.ok) {
      if (res.status === 204) return null;
      const txt = await res.text();
      try { return txt ? JSON.parse(txt) : null; } catch { return txt; }
    }
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

const store = {
  get(keys) { return chrome.storage.local.get(keys); },
  set(obj) { return chrome.storage.local.set(obj); }
};

// يجدّد التوكن عند انتهاء صلاحيته (401) باستخدام كلمة المرور المحفوظة
async function refreshToken() {
  const { nabihTempMail: address, nabihTempPassword: password } =
    await store.get(["nabihTempMail", "nabihTempPassword"]);
  if (!address || !password) {
    const err = new Error("انتهت جلسة البريد ولا توجد كلمة مرور محفوظة — أنشئ بريداً جديداً");
    err.status = 401;
    throw err;
  }
  const tok = await request("/token", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ address, password })
  });
  await store.set({ nabihTempToken: tok.token, nabihTempId: tok.id });
  return tok.token;
}

// طلب مصادق عليه: يجدّد التوكن تلقائياً عند 401 ثم يعيد المحاولة مرة واحدة
async function authRequest(path, init = {}, allowRetry = true) {
  let token = (await store.get("nabihTempToken")).nabihTempToken;
  if (!token) {
    const err = new Error("لم يتم إنشاء بريد بعد");
    err.status = 401;
    throw err;
  }
  const res = await fetch(API + path, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }
  });

  if (res.status === 401 && allowRetry) {
    token = await refreshToken();
    const retry = await fetch(API + path, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }
    });
    if (!retry.ok) {
      const err = new Error("mail.tm " + retry.status);
      err.status = retry.status;
      throw err;
    }
    return readBody(retry);
  }

  if (!res.ok) {
    const err = new Error("mail.tm " + res.status);
    err.status = res.status;
    throw err;
  }
  return readBody(res);
}

async function readBody(res) {
  if (res.status === 204) return null;
  const txt = await res.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return txt; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const handlers = {
  async create() {
    const d = await request("/domains");
    const domain = d["hydra:member"].find(x => x.isActive)?.domain
      || d["hydra:member"][0]?.domain;
    if (!domain) throw new Error("لا تتوفر نطاقات بريد حالياً");

    const address = `nabih-${Date.now()}@${domain}`;
    const password = crypto.randomUUID();

    await request("/accounts", {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ address, password })
    });

    const tok = await request("/token", {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ address, password })
    });

    // حفظ كل ما نحتاجه: التوكن ينتهي، كلمة المرور تُستخدم لإنشاء توكن جديد
    await store.set({
      nabihTempMail: address,
      nabihTempToken: tok.token,
      nabihTempId: tok.id,
      nabihTempPassword: password
    });

    return { address, domain };   // تُستخدم في popup.js و content.js
  },

  async inbox() {
    // يجلب كل الصفحات (لا الصفحة الأولى فقط) حتى لا تظهر الرسائل ناقصة
    const items = [];
    const seenIds = new Set();
    let total = 0;
    let page = 1;

    while (page <= MAX_INBOX_PAGES) {
      const box = await authRequest(`/messages?page=${page}`);
      const member = (box && box["hydra:member"]) || [];
      if (box && typeof box["hydra:totalItems"] === "number") total = box["hydra:totalItems"];

      member.forEach(m => {
        if (!m || !m.id || seenIds.has(m.id)) return;
        seenIds.add(m.id);
        items.push({
          id: m.id,
          subject: m.subject || "",
          from: m.from || {},
          seen: !!m.seen,
          intro: m.intro || "",           // مقتطف من النص/الأتش تي ام أل (في الملخص فقط)
          hasAttachments: !!m.hasAttachments,
          createdAt: m.createdAt || "",
          isDeleted: !!m.isDeleted
        });
      });

      if (!member.length || (total && items.length >= total)) break;
      page++;
      await sleep(120);                   // احترام حد الطلبات في mail.tm
    }

    items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return {
      items,
      total: total || items.length,
      complete: items.length >= (total || items.length)
    };
  },

  async read({ id }) {
    if (!id) throw new Error("معرّف الرسالة مفقود");
    const full = await authRequest(`/messages/${id}`);

    // html قد يكون مصفوفة من السلاسل (حسب المستند) — ندمجه كنص واحد
    const htmlArr = Array.isArray(full?.html) ? full.html : (full?.html ? [full.html] : []);
    const html = htmlArr.join("\n");
    const text = full?.text || "";

    // روابط التحقق: من الأتش تي ام أولاً (href)، ثم من النص (عنوان كامل)
    const out = [];
    const seen = new Set();
    const add = (u) => {
      let x;
      try {
        x = String(u).trim();
        if (!x || x.startsWith("#") || x.startsWith("mailto:")) return;
        new URL(x);
      } catch { return; }
      if (!seen.has(x)) { seen.add(x); out.push(x); }
    };
    (html.match(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi) || [])
      .map(a => { const m = a.match(/href\s*=\s*["']([^"']+)["']/i); return m ? m[1] : ""; })
      .filter(Boolean).forEach(add);
    (html.match(/https?:\/\/[^\\<"'\s]+/g) || []).forEach(add);
    (text.match(/https?:\/\/[^\s<>"']+/g) || []).forEach(add);

    // كود التحقق (OTP): من النص أولاً، ثم من نص الأتش تي ام إن لم يوجد نص
    const plainSource = text || html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ");
    const code = extractCode(plainSource, out);

    // المرفقات (إن وجدت)
    const attachments = Array.isArray(full?.attachments)
      ? full.attachments.map(a => ({
          id: a.id,
          filename: a.filename || a.name || "مرفق",
          contentType: a.contentType || a.mimeType || "",
          size: a.size || 0,
          downloadUrl: a.downloadUrl || a.url || null
        }))
      : [];

    // تعليم الرسالة كمقروءة في الخادم (غير blocking)
    try {
      await authRequest(`/messages/${id}`, {
        method: "PATCH",
        headers: { ...JSON_HEADERS, "Content-Type": "application/merge-patch+json" },
        body: JSON.stringify({ seen: true })
      });
    } catch { /* غير حرج */ }

    return {
      id,
      subject: full?.subject || "",
      from: full?.from || {},
      to: full?.to || [],
      cc: full?.cc || [],
      createdAt: full?.createdAt || "",
      seen: true,
      intro: full?.intro || "",
      html,                 // html نصي متصل كامل (وليس مصفوفة) — بدون اقتطاع
      text,                 // النص الكامل
      links: out,           // كل الروابط المطلقة (الأتش تي ام أولاً)
      code,                 // كود التحقق المستخلص، أو null
      attachments
    };
  },

  async remove({ id }) {
    if (!id) throw new Error("معرّف الرسالة مفقود");
    await authRequest(`/messages/${id}`, { method: "DELETE" });
    return { id };
  }
};

// كود التحقق: 4-8 أرقام (أو مفصولة بمسافة/شرطة)، مع استبعاد أرقام الروابط
function extractCode(source, links) {
  const blob = String(source || "");
  if (!blob) return null;
  const linkBlob = (links || []).join("\n");

  const candidates = [];
  const push = (v) => {
    const digits = String(v).replace(/[\s-]/g, "");
    if (/^\d{4,8}$/.test(digits) && !linkBlob.includes(digits)) candidates.push(digits);
  };

  (blob.match(/\b\d{3,4}[ -]\d{3,4}\b/g) || []).forEach(push);           // 123 456 / 123-456
  (blob.match(/\b\d{4,8}\b/g) || []).forEach(push);                      // 123456

  const uniq = [...new Set(candidates)];
  return uniq.find(t => /^\d{4,6}$/.test(t)) || uniq.find(t => /^\d{7,8}$/.test(t)) || null;
}

chrome.runtime.onMessage.addListener((msg, sender, done) => {
  (handlers[msg?.type]?.(msg) ?? Promise.reject(new Error("أمر غير معروف")))
    .then(data => done({ ok: true, data }))
    .catch(err => done({ ok: false, error: err.message, status: err.status }));
  return true;   // إبقاء قناة الرسائل مفتوحة للرد غير المتزامن
});
