// ============================================================
// نبيه | البريد المؤقت (mail.tm) — خدمة الخلفية (Service Worker)
// يحمل كـ background.service_worker في manifest.json
// جميع استدعاءات api.mail.tm تمر من هنا فقط.
// ============================================================

const API = "https://api.mail.tm";
const json = { "Content-Type": "application/json" };

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
    const password = crypto.randomUUID();

    await request("/accounts", {
      method: "POST", headers: json,
      body: JSON.stringify({ address, password })
    });

    const tok = await request("/token", {
      method: "POST", headers: json,
      body: JSON.stringify({ address, password })
    });

    // حفظ كل ما نحتاجه: التوكن ينتهي، كلمة المرور تُستخدم لإنشاء توكن جديد
    await chrome.storage.local.set({
      nabihTempMail: address,
      nabihTempToken: tok.token,
      nabihTempId: tok.id,
      nabihTempPassword: password
    });

    return { address, domain };   // تُستخدم في popup.js و content.js
  },

  async inbox() {
    const { nabihTempToken } = await chrome.storage.local.get("nabihTempToken");
    if (!nabihTempToken) throw new Error("لم يتم إنشاء بريد بعد");
    const box = await request("/messages", {
      headers: { Authorization: `Bearer ${nabihTempToken}` }
    });
    // mail.tm يُرجع تجميعة Hydra؛ البيانات الحقيقية في hydra:member
    const list = (box && box["hydra:member"]) || [];
    return list.map(m => ({
      id: m.id,
      subject: m.subject || "",
      from: m.from || {},
      seen: !!m.seen,
      intro: m.intro || ""
    }));
  },

  async read({ id }) {
    const { nabihTempToken } = await chrome.storage.local.get("nabihTempToken");
    if (!nabihTempToken) throw new Error("لم يتم إنشاء بريد بعد");
    return request(`/messages/${id}`, {
      headers: { Authorization: `Bearer ${nabihTempToken}` }
    });
    // -> { text: "...", html: "...", subject, from, ... }
  },

  async remove({ id }) {
    const { nabihTempToken } = await chrome.storage.local.get("nabihTempToken");
    if (!nabihTempToken) throw new Error("لم يتم إنشاء بريد بعد");
    return fetch(API + `/messages/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${nabihTempToken}` }
    });
  }
};

chrome.runtime.onMessage.addListener((msg, sender, done) => {
  (handlers[msg?.type]?.(msg) ?? Promise.reject(new Error("أمر غير معروف")))
    .then(data => done({ ok: true, data }))
    .catch(err => done({ ok: false, error: err.message, status: err.status }));
  return true;   // إبقاء قناة الرسائل مفتوحة للرد غير المتزامن
});
