

const CONFIGS = {
  email: {
    icon: "⚠️",
    name: "بريد إلكتروني",
    title: "تنبيه أمان البريد",
    tip: "تحقق من رابط الموقع ولا تشارك بريدك إلا مع جهات موثوقة لتجنب التصيد والاحتيال."
  },
  password: {
    icon: "🔑",
    name: "كلمة المرور",
    title: "إرشادات كلمة المرور",
    tip: "استخدم كلمة مرور قوية وغير مكررة لا تقل عن 12 خانة مع رموز وأرقام.",
    isPassword: true
  },
  confirm_password: {
    icon: "🔒",
    name: "تأكيد كلمة المرور",
    title: "تأكيد كلمة المرور",
    tip: "تأكد من تطابق كلمة المرور مع الحقل السابق. يتم تعبئتها تلقائياً عند إنشاء كلمة مرور.",
    isPassword: false
  },
  phone: {
    icon: "📱",
    name: "رقم الهاتف",
    title: "تنبيه رقم الهاتف",
    tip: "لا تشارك رقم هاتفك إلا عند الضرورة للتحقق، تجنباً للرسائل المزعجة."
  },
  username: {
    icon: "👤",
    name: "اسم المستخدم",
    title: "إرشادات اسم المستخدم",
    tip: "اختر اسماً لا يكشف هويتك الحقيقية أو بياناتك الشخصية."
  },
  payment: {
    icon: "💳",
    name: "بيانات الدفع",
    title: "تنبيه الأمان عند الدفع",
    tip: "لا تستخدم بطاقتك البنكية الرئيسية. استخدم بطاقة مدفوعة مسبقاً أو بطاقة إضافية بمبلغ محدود لتجنب الخصومات غير المقصودة (تجارب مجانية، اشتراكات متكررة، مواقع مشبوهة)."
  }
};

// مولّد كلمات المرور متوافق مع @rabbit-company/password-generator
const PasswordGenerator = {
  generate(length = 16, uppercase = true, numbers = true, symbols = true) {
    let chars = "abcdefghijklmnopqrstuvwxyz";
    if (uppercase) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (numbers) chars += "0123456789";
    if (symbols) chars += "!@#$%^&*()_+-=[]{}|;:,.<>?";

    if (!chars.length) chars = "abcdefghijklmnopqrstuvwxyz";

    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, n => chars[n % chars.length]).join("");
  }
};

let settings = { displayMode: "inline", showFormNotification: true };
let pwdSettings = { length: 16, uppercase: true, numbers: true, symbols: true };
let detectedFields = [];
let detectedFormsCount = 0;
let formToastShown = false;
let tooltipEl = null;
let sidebarEl = null;
let sidebarToggle = null;

// فحص ما إذا كان الحقل مخصصاً لتأكيد كلمة المرور
function isConfirmPasswordField(input, allAttrs = "", lowerLbl = "") {
  const type = (input.type || "").toLowerCase();
  const attrs = allAttrs || `${input.name || ""} ${input.id || ""} ${input.placeholder || ""} ${input.autocomplete || ""}`.toLowerCase();
  const lbl = lowerLbl || (() => {
    let t = "";
    if (input.id) {
      const el = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (el) t += " " + el.textContent;
    }
    const p = input.closest("label");
    if (p) t += " " + p.textContent;
    return t.toLowerCase();
  })();

  const confirmRegex = /\b(confirm|confirmation|repeat|retype|reenter|re-enter|re_enter|pwd2|password2|pass2|verify-password|password_verify)\b/i;
  const arabicConfirmRegex = /(تأكيد|تاكيد|إعادة|اعادة|تكرار)/i;

  if (confirmRegex.test(attrs) || arabicConfirmRegex.test(attrs)) return true;
  if (arabicConfirmRegex.test(lbl) || confirmRegex.test(lbl)) return true;

  // فحص ما إذا كان هذا الحقل هو الحقل الثاني أو اللاحق لكلمة المرور في نفس النموذج
  if (type === "password" || /(password|pwd)/i.test(attrs)) {
    const form = input.closest("form") || input.form;
    if (form) {
      const pwdInputs = Array.from(form.querySelectorAll('input[type="password"]')).filter(
        i => !/\b(cvv|cvc|cvn|csc|card)\b/i.test(`${i.name} ${i.id} ${i.placeholder} ${i.autocomplete}`)
      );
      const idx = pwdInputs.indexOf(input);
      if (idx > 0) return true;
    }
  }

  return false;
}

// الكشف عن نوع الحقل بسرعة وبدون layout thrashing
function detectFieldType(input) {
  const type = (input.type || "").toLowerCase();
  const allAttrs = `${input.name || ""} ${input.id || ""} ${input.placeholder || ""} ${input.autocomplete || ""}`.toLowerCase();

  let labelText = "";
  if (input.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (lbl) labelText += " " + lbl.textContent;
  }
  const parent = input.closest("label");
  if (parent) labelText += " " + parent.textContent;
  const lowerLbl = labelText.toLowerCase();

  // ---------- PAYMENT (بطاقات الدفع) ----------
  // نفحص حقول الدفع أولاً لأن حقول CVV/CVC تكون غالباً type="password" حتى لا تظهر ككلمة مرور!
  if (type === "credit-card-number" || type === "cc-number" || type === "cc-exp" || type === "cc-csc") return "payment";
  // معيار المتصفح القياسي لحقول البطاقات (autocomplete="cc-*")
  if (/^cc-/i.test(input.autocomplete || "")) return "payment";
  // إشارات لاتينية — \b آمنة مع ASCII فقط
  if (/\b(card|credit|cc|ccnum|cardnumber|card-number|cardnum|cvv|cvc|cvv2|cvn|csc|securitycode|security-code|expiry|expiration|expdate|exp-date|pan)\b/i.test(allAttrs)) return "payment";
  if (/\b(visa|mastercard|amex|mada|paypal|stripe|tabby|tamara|apple.?pay|google.?pay|stc.?pay)\b/i.test(allAttrs)) return "payment";
  // إشارات عربية — \b لا تعمل مع الحروف العربية، فتُستخدم بدونها
  if (/(بطاقة|بطاقه|شريحة|فيزا|ماستركارد|مدى|مدفوعة|مدفوعه)/i.test(allAttrs)) return "payment";
  if (/(بطاقة|بطاقه|شريحة|فيزا|ماستركارد|مدى|كود الأمان|كود الامان|رمز الأمان|رمز الامان|أمان البطاقة|امان البطاقة|تاريخ الانتهاء|تاريخ انتهاء)/i.test(lowerLbl)) return "payment";

  // ---------- CONFIRM PASSWORD (تأكيد كلمة المرور) ----------
  // حقول تأكيد كلمة المرور نميزها كي لا ننشئ لها مولّد كلمة مرور مكرر
  if (isConfirmPasswordField(input, allAttrs, lowerLbl)) return "confirm_password";

  // ---------- PASSWORD (كلمة المرور) ----------
  if (type === "password") return "password";
  if (/\b(password|pwd|secret|كلمة المرور|السر)\b/i.test(allAttrs) && !/\bpassport\b/i.test(allAttrs)) return "password";
  if (/\b(password|كلمة المرور|السر)\b/i.test(lowerLbl)) return "password";

  // ---------- EMAIL (البريد الإلكتروني) ----------
  if (type === "email") return "email";
  if (/\b(email|mail|بريد|ايميل)\b/i.test(allAttrs)) return "email";
  if (/\b(email|بريد|ايميل)\b/i.test(lowerLbl)) return "email";

  // ---------- PHONE (رقم الهاتف) ----------
  if (type === "tel") return "phone";
  if (/\b(phone|mobile|tel|هاتف|جوال)\b/i.test(allAttrs)) return "phone";
  if (/\b(phone|هاتف|جوال)\b/i.test(lowerLbl)) return "phone";

  // ---------- USERNAME (اسم المستخدم) ----------
  if (/\b(username|user|login|اسم المستخدم|المعرف)\b/i.test(allAttrs)) return "username";
  if (/\b(username|اسم المستخدم)\b/i.test(lowerLbl)) return "username";

  return null;
}

// تعبئة كلمة المرور في الحقل وحقل التأكيد
function fillPassword(targetInput, value) {
  targetInput.value = value;
  targetInput.dispatchEvent(new Event("input", { bubbles: true }));
  targetInput.dispatchEvent(new Event("change", { bubbles: true }));

  const form = targetInput.closest("form") || targetInput.form;
  if (form) {
    form.querySelectorAll('input[type="password"]').forEach(p => {
      // نملأ حقول كلمات المرور الأخرى فقط إذا لم تكن حقول دفع (مثل CVV)
      if (p !== targetInput && detectFieldType(p) !== "payment") {
        p.value = value;
        p.dispatchEvent(new Event("input", { bubbles: true }));
        p.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  } else {
    // خارج النموذج الصريح: نملأ حقول كلمات المرور والتأكيد المرتبطة
    detectedFields.forEach(item => {
      if (item.input !== targetInput && (item.type === "password" || item.type === "confirm_password")) {
        item.input.value = value;
        item.input.dispatchEvent(new Event("input", { bubbles: true }));
        item.input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }
  navigator.clipboard.writeText(value).catch(() => {});
}

// ============================================================
// نبيه | البريد المؤقت (mail.tm) — داخل تنبيه البريد الإلكتروني
// ============================================================

// علبة الرسائل داخل التلميح المنبثق (تُفرّغ وتُعبأ عند كل فتح)
function createTempMailBlock(targetInput) {
  const box = document.createElement("div");
  box.className = "nabih-tm-box";
  box.dir = "ltr";
  box.innerHTML = `
    <div class="nabih-tm-head">
      <strong>📧 بريد مؤقت</strong>
      <button type="button" class="nabih-tm-copy" title="نسخ العنوان">📋</button>
    </div>
    <div class="nabih-tm-address" title="اضغط لنسخ العنوان">لم يتم الإنشاء بعد</div>
    <div class="nabih-tm-actions">
      <button type="button" class="nabih-pwd-fill nabih-tm-create">إنشاء بريد مؤقت</button>
      <button type="button" class="nabih-focus-btn nabih-tm-fill" disabled title="تعبئة العنوان في هذا الحقل">⬇️ تعبئة الحقل</button>
      <button type="button" class="nabih-focus-btn nabih-tm-inbox" disabled>تحديث الصندوق</button>
    </div>
    <div class="nabih-tm-meta">
      <span class="nabih-tm-count">0 رسالة</span>
      <span class="nabih-tm-status"></span>
    </div>
    <div class="nabih-tm-messages"></div>
    <div class="nabih-tm-note">مفعّل بواسطة mail.tm — بريد عام مؤقت</div>
  `;

  const addrEl = box.querySelector(".nabih-tm-address");
  const metaCount = box.querySelector(".nabih-tm-count");
  const metaStatus = box.querySelector(".nabih-tm-status");
  const createBtn = box.querySelector(".nabih-tm-create");
  const fillBtn = box.querySelector(".nabih-tm-fill");
  const inboxBtn = box.querySelector(".nabih-tm-inbox");
  const msgBox = box.querySelector(".nabih-tm-messages");
  let address = null;

  function status(text, ok) {
    metaStatus.textContent = text || "";
    metaStatus.style.color = ok === false ? "#f87171" : "#34d399";
  }

  const fillField = async (e) => {
    if (e) e.stopPropagation();
    if (!address) return;
    targetInput.value = address;
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    targetInput.dispatchEvent(new Event("change", { bubbles: true }));
    targetInput.focus();
    await navigator.clipboard.writeText(address).catch(() => {});
    status("تمت تعبئة البريد في الحقل", true);
  };
  fillBtn.onclick = fillField;

  function render(list = []) {
    // list قد يكون مصفوفة (توافق قديم) أو {items, total, complete} من المعالج الجديد
    const items = Array.isArray(list) ? list : (list.items || []);
    const total = (list && list.total) ? list.total : items.length;

    metaCount.textContent = total !== items.length ? `${items.length} من ${total}` : total + " رسالة";
    msgBox.innerHTML = items.length ? "" : '<div class="nabih-tm-empty">الصندوق فارغ</div>';

    items.forEach(m => {
      const row = document.createElement("div");
      row.className = "nabih-tm-msg" + (m.seen ? "" : " nabih-tm-unread");
      const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "";

      // بناء الصف بعناصر DOM نصية: محتوى الرسالة لا يمكنه تخريب الصفحة أو حقن HTML
      const title = document.createElement("strong");
      title.dir = "auto";
      title.textContent = m.subject || "(بدون موضوع)";

      const intro = document.createElement("p");
      intro.className = "nabih-tm-intro";
      intro.dir = "auto";
      intro.textContent = (m.intro || "").trim();

      const meta = document.createElement("small");
      meta.dir = "auto";
      meta.textContent = [m.from?.address || "", time, m.hasAttachments ? "📎" : ""]
        .filter(Boolean).join("  •  ");

      row.appendChild(title);
      if (intro.textContent) row.appendChild(intro);
      row.appendChild(meta);

      let cache = null;
      let autoOpened = false;
      const ensureFull = async () => {
        if (cache) return cache;
        const r = await chrome.runtime.sendMessage({ type: "read", id: m.id });
        if (!r?.ok) throw new Error(r?.error || "لا استجابة");
        cache = r.data;
        if (!m.seen) { m.seen = true; row.classList.remove("nabih-tm-unread"); }
        return cache;
      };

      // نقر على الصف: تعبئة الحقل بالكود/الرابط + نسخه + عرض الرسالة كاملة
      row.onclick = async (ev) => {
        ev.stopPropagation();
        // النقر داخل عارض الرسالة لا يُطويها
        if (ev.target.closest && ev.target.closest(".nb-mv-view")) return;
        status("جاري القراءة…");
        try {
          // نقر ثانٍ على الصف يطوي الرسالة
          if (row.querySelector(".nb-mv-view")) {
            row.querySelector(".nb-mv-view").remove();
            status("");
            return;
          }
          const full = await ensureFull();
          const links = Array.isArray(full.links) ? full.links : [];
          const code = full.code || null;

          // أولوية التعبئة: كود التحقق، وإلا أول رابط، وإلا النص
          const fillValue = code || links[0] || full.text || "";
          targetInput.value = fillValue;
          targetInput.dispatchEvent(new Event("input", { bubbles: true }));
          await navigator.clipboard.writeText(fillValue).catch(() => {});

          renderMessageBody(row, m, full);

          if (code) status(`تم نسخ الكود: ${code}`, true);
          else if (links[0]) status("تم نسخ الرابط (والتعبئة بنصه)", true);
          else status("تم النسخ", true);

          // فتح رابط التحقق مرة واحدة فقط (إن لم يكن هناك كود)
          if (!code && links.length && !autoOpened) {
            autoOpened = true;
            try { window.open(links[0], "_blank", "noopener,noreferrer"); } catch (e) {}
          }
        } catch (err) {
          status("خطأ: " + err.message, false);
        }
      };
      msgBox.appendChild(row);
    });

    if (total !== items.length) {
      const note = document.createElement("div");
      note.className = "nabih-tm-empty";
      note.textContent = `يظهر أحدث ${items.length} رسالة من ${total}.`;
      msgBox.appendChild(note);
    }
  }

  // يعرض جسم الرسالة كاملاً وآمناً داخل إطار معزول (بدون كود HTML خام ولا اقتطاع)
  function renderMessageBody(row, m, full) {
    const existing = row.querySelector(".nb-mv-view");
    if (existing) { existing.remove(); return null; }

    const Renderer = window.NabihMail;
    if (!Renderer) { status("عارض الرسائل غير محمّل", false); return null; }

    const view = Renderer.createView(full, {
      height: 240,
      expandedHeight: 420,
      onStatus: (t) => status(t),
      onOpen: (u) => { try { window.open(u, "_blank", "noopener,noreferrer"); } catch (e) {} },
      onDelete: async (msg) => {
        const r = await chrome.runtime.sendMessage({ type: "remove", id: msg.id });
        if (!r?.ok) throw new Error(r?.error || "تعذّر الحذف");
        row.remove();
        status("تم حذف الرسالة", true);
      }
    });
    row.appendChild(view);
    return view;
  }

  createBtn.onclick = async (e) => {
    e.stopPropagation();
    createBtn.disabled = true;
    status("جاري الإنشاء…");
    try {
      const r = await chrome.runtime.sendMessage({ type: "create" });
      if (!r?.ok) throw new Error(r?.error || "لا استجابة");
      address = r.data.address;
      addrEl.textContent = address;
      addrEl.title = "اضغط لنسخ العنوان";
      addrEl.classList.add("nabih-tm-has");
      inboxBtn.disabled = false;
      fillBtn.disabled = false;
      targetInput.value = address;
      targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      await chrome.storage.local.set({ nabihTempMail: address });
      status("تم الإنشاء والتعبئة", true);
      inboxBtn.click();
    } catch (err) {
      status("خطأ: " + err.message, false);
    } finally {
      createBtn.disabled = false;
    }
  };

  inboxBtn.onclick = async (e) => {
    e.stopPropagation();
    if (!address) return;
    status("جاري التحديث…");
    try {
      const r = await chrome.runtime.sendMessage({ type: "inbox" });
      if (!r?.ok) throw new Error(r?.error || "لا استجابة");
      render(r.data);
      status("تم التحديث");
    } catch (err) {
      status("خطأ: " + err.message, false);
    }
  };

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address).catch(() => {});
    status("تم نسخ العنوان");
  };
  addrEl.onclick = e => { e.stopPropagation(); copy(); };
  box.querySelector(".nabih-tm-copy").onclick = e => { e.stopPropagation(); copy(); };

  // استعادة العنوان السابق عند فتح التلميح
  chrome.storage.local.get("nabihTempMail", ({ nabihTempMail }) => {
    if (nabihTempMail) {
      address = nabihTempMail;
      addrEl.textContent = address;
      addrEl.classList.add("nabih-tm-has");
      inboxBtn.disabled = false;
      fillBtn.disabled = false;
      metaCount.textContent = "0 رسالة";
      status("تم استعادة العنوان");
    }
  });

  return box;
}

// ============================================================
// نبيه | تنبيه صفحات الدفع (Payment Warning)
// ============================================================

// إعدادات التنبيه — تُحمّل من التخزين، true بشكل افتراضي
let PAYMENT_WARN = true;
let PAYMENT_TOAST = true;

const CARD_PATTERN = /\b(?:\d[\s\-–]*?){12,19}\b/g;

// بادئات بطاقات حقيقية — تشمل بطاقات مدى السعودية وبطاقات مدفوعة مسبقاً
// فيزا=4 | ماستركارد=5[1-5] | ماستركارد حديث=2[2-7] | أمريكان إكسبريس=3[47] | ديسكفر=6xxx
const CARD_BIN = /^(?:4|5[1-5]|2[2-7]|3[47]|6[0-9]{2}|9[0-9]{2})/;

// إشارات صفحة الدفع (نصوص معروضة للمستخدم فقط — لا تقرأ الروابط ولا الجافاسكريبت الداخلي)
// ملاحظة تقنية: \b (حدود الكلمات) في JavaScript تعمل مع ASCII فقط ولا تطابق
// الحدود حول الحروف العربية — لهذا نفصل الإشارات اللاتينية (مع \b) عن العربية (بدون \b).
// كان هذا سبب فشل الكشف في معظم صفحات الدفع العربية (تمارا/تابي/مدى...).
const CHECKOUT_LATIN = /\b(checkout|payment|payments|pay|pay now|invoice|billing|order summary|purchase|subscribe|subscription|renew|donate|cart)\b/i;
const CHECKOUT_ARABIC = /(دفع|ادفع|ادفع الآن|فاتورة|سلة المشتريات|سلة التسوق|إتمام الشراء|اتمام الشراء|الشراء|اشتراك|اشترك|تجديد|طلبك|تأكيد الطلب|تاكيد الطلب|طريقة الدفع|بيانات الدفع|المحفظة|سداد|تمارا|تابي|مدى|فيزا|ماستركارد)/i;
const PAY_FIELD_LATIN = /\b(card|credit|cc|ccnum|cardnumber|card-number|cardnum|cvv|cvc|cvv2|cvn|csc|securitycode|security-code|expiry|expiration|expdate|exp-date|pan)\b/i;
const PAY_FIELD_ARABIC = /(بطاقة|بطاقه|شريحة|فيزا|ماستركارد|مدى|كود الأمان|كود الامان|رمز الأمان|رمز الامان|تاريخ الانتهاء)/i;
const PAY_URL_PATH = /\/(checkout|payment|payments|pay|billing|order|purchase|cart|subscribe|donate)(\/|\.|$|\?)/i;
// بوابات الدفع وحقول البطاقات المضمّنة داخل iframe (Stripe/Moyasar/Tabby/...)
const PAY_IFRAME = /(stripe|paymob|moyasar|hyperpay|tap\.company|tabby|tamara|apple\.?pay|google\.?pay|secure-?checkout|checkout\.|payment|ipay|oppwa)/i;

// هل يبدو هذا الحقل حقل بطاقة/دفع؟ (يُستخدم في فحص الصفحة العام)
function isPaymentField(input) {
  const blob = (input.name + " " + input.id + " " + input.placeholder + " " +
    (input.autocomplete || "") + " " +
    Array.from(input.labels || []).map(l => l.textContent).join(" ")).toLowerCase();
  return PAY_FIELD_LATIN.test(blob) || PAY_FIELD_ARABIC.test(blob);
}

// كم مرة وكم ننتظر؟ حقول الدفع تُولّد متأخرة (SPA / Stripe Elements / Tabby / Tamara widgets)
const MAX_PAYMENT_RETRIES = 6;
const PAYMENT_SCAN_INTERVAL_MS = 800;

// فحص الصفحة بأكملها — يُعاد تلقائياً حتى تظهر حقول الدفع أو نصل الحد الأقصى.
// يقرأ النص الظاهر وخصائص الحقول فقط (يحترم الخصوصية — لا يرسل شيئاً خارج الصفحة).
//
// منطق التقييم بالنقاط (كانت المشكلة: اعتماد كامل على كلمات لا تُطابقها \b العربية
// + اشتراط إشارتين معاً — ففات 90% من صفحات الدفع):
//   حقل بطاقة واضح ............. 2 نقطة (أقوى إشارة)
//   إطار دفع مضمّن (iframe) ..... 2 نقاط (Stripe/Moyasar/Tabby... محتواها محمي)
//   نصوص "دفع/شراء" ............. 1 نقطة
//   مسار الرابط (/checkout...) . 1 نقطة
//   زر دفع (ادفع الآن...) ...... 1 نقطة
//   رقم يشبه البطاقة ............ 1 نقطة
// تُعتبر الصفحة صفحة دفع عند مجموع نقطتين مع وجود إشارة بنيوية واحدة على الأقل
// (حقل بطاقة، إطار دفع، مسار رابط، أو رقم بطاقة) حتى لا تكفي المصادفات النصية.
function scanPageForPayments(attempt = 1) {
  // (1) حقول الدفع: name / id / placeholder / autocomplete / label
  const cardInputs = [...document.querySelectorAll("input, select")].filter(isPaymentField);

  // (2) إطارات الدفع المضمّنة — حقول Stripe وغيرها داخل iframe لا يمكن قراءة
  //     محتواها من content script، لكن وجود الإطار نفسه إشارة قوية على وجود دفع
  const payIframes = [...document.querySelectorAll("iframe")].filter(f => {
    const blob = `${f.src || ""} ${f.title || ""} ${f.name || ""} ${f.getAttribute("aria-label") || ""}`;
    return PAY_IFRAME.test(blob);
  }).length;

  // (3) نصوص صفحة الدفع الظاهرة للمستخدم
  const text = (document.body && document.body.innerText) || "";
  const hasCheckout = CHECKOUT_LATIN.test(text) || CHECKOUT_ARABIC.test(text);

  // (4) مسار الرابط الحالي
  const urlHit = PAY_URL_PATH.test(location.pathname || "");

  // (5) أزرار الدفع — كثير من بوابات الدفع زرّ فقط بدون حقول ظاهرة
  const payButtons = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')]
    .filter(b => {
      const t = (b.textContent || b.value || b.getAttribute("aria-label") || "").trim();
      return t && (CHECKOUT_LATIN.test(t) || CHECKOUT_ARABIC.test(t));
    }).length;

  // (6) أرقام تشبه البطاقة في النص (تُستثنى الحقول والمحتوى الداخلي <script>/<style>)
  let cardLikeCount = 0;
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (/^(SCRIPT|STYLE)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
        if (p.closest("input,textarea,select,[contenteditable]")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      let m; CARD_PATTERN.lastIndex = 0;
      while ((m = CARD_PATTERN.exec(node.textContent))) {
        const num = m[0].replace(/\D/g, "");
        if (num.length >= 15 && CARD_BIN.test(num)) cardLikeCount++;
      }
    }
  } catch (e) { /* لا نكسر التنبيه */ }

  let score = 0;
  if (cardInputs.length >= 1) score += 2;
  if (payIframes >= 1) score += 2;
  if (hasCheckout) score += 1;
  if (urlHit) score += 1;
  if (payButtons >= 1) score += 1;
  if (cardLikeCount > 0) score += 1;

  const hasStructuralSignal =
    cardInputs.length >= 1 || payIframes >= 1 || urlHit || cardLikeCount > 0;
  const isPayment = score >= 2 && hasStructuralSignal;

  // إعادة المحاولة: حقول الدفع تُولّد متأخرة. ننتظر body حقيقياً (نص > 60 محرفاً).
  const bodyReady = document.body && document.body.innerText && document.body.innerText.length > 60;
  if (!isPayment && attempt < MAX_PAYMENT_RETRIES && (!bodyReady || attempt < 3)) {
    clearTimeout(window.__nabihPayScanTimer);
    window.__nabihPayScanTimer = setTimeout(() => {
      if (document.visibilityState === "visible") scanPageForPayments(attempt + 1);
    }, PAYMENT_SCAN_INTERVAL_MS);
    return false;
  }

  return isPayment;
}

// فحص مجدول للدفع — يُستدعى بهدوء من scanPage عند أي تغيّر في الصفحة
// (هذا ما يجعل الكشف يعمل مع تطبيقات الصفحة الواحدة SPA التي تولّد حقول
// الدفع بعد التنقّل دون إعادة تحميل) وعند تنقّل history/hash.
let paymentScanScheduled = false;
let lastPaymentUrl = location.href;
function schedulePaymentScan() {
  if (paymentScanScheduled) return;
  paymentScanScheduled = true;
  setTimeout(() => {
    paymentScanScheduled = false;
    if (document.visibilityState !== "visible") return;
    // السماح بإظهار تنبيه جديد بعد تنقّل داخل SPA دون إعادة تحميل
    if (location.href !== lastPaymentUrl) {
      window.__nabihPaymentToast = false;
      lastPaymentUrl = location.href;
    }
    scanPageForPayments();
  }, 700);
}
window.addEventListener("popstate", schedulePaymentScan);
window.addEventListener("hashchange", schedulePaymentScan);

// تطبيق تنبيه الصفحة وإعادة المحاولة الذكية (تُستدعى بعد تحميل الإعدادات فقط)
function ensurePaymentPageWarning() {
  if (!PAYMENT_TOAST) return;
  if (scanPageForPayments()) showPaymentToast();
}
// إشعار منبثق في الزاوية (مستقل عن أي حقل) — لصفحات الدفع العامة
function showPaymentToast() {
  if (!PAYMENT_TOAST || window.__nabihPaymentToast) return;
  window.__nabihPaymentToast = true;

  const toast = document.createElement("div");
  toast.className = "nabih-toast nabih-toast-payment";
  toast.dir = "rtl";
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <div class="nabih-toast-icon" aria-hidden="true">💳</div>
    <div class="nabih-toast-body">
      <strong>صفحة دفع مكتشفة</strong>
      <p>استخدم بطاقة إضافية أو مدفوعة مسبقاً بمبلغ محدود، ولا تربط بطاقتك البنكية الرئيسية أو بطاقة "مدى" الأساسية.</p>
    </div>
    <button type="button" class="nabih-toast-close" title="إغلاق">✕</button>
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  const closeToast = () => toast.remove();
  toast.querySelector(".nabih-toast-close").onclick = closeToast;
  setTimeout(closeToast, 12000);
}

// تنبيه شامل للدفع: تلميح عند الحقل + إشعار بالصفحة + بطاقة في الشريط الجانبي
function showPaymentWarning(item) {
  if (!PAYMENT_WARN) return;

  // إشعار منبثق في الزاوية (مرتبط بالصفحة وليس بالحقل)
  showPaymentToast();

  // بطاقة في الشريط الجانبي (إن كان مفعّلاً)
  if (settings.displayMode === "sidebar" && typeof updateSidebarContent === "function") {
    updateSidebarContent();
  }
}

// رصد الأرقام التي تبدو كرقم بطاقة أثناء الكتابة الحية (تُفعّل بعد تحميل الإعدادات)
function watchPaymentInput(input) {
  let notified = false;
  const handler = () => {
    if (notified || !settingsLoaded || !PAYMENT_WARN) return;
    const val = input.value.replace(/[\s\-–]/g, "");
    if (val.length >= 12 && CARD_BIN.test(val)) {
      notified = true;
      const item = detectedFields.find(i => i.input === input);
      if (item) showPaymentWarning(item);
    }
  };
  input.addEventListener("input", handler, { passive: true });
}

// عنصر مولد كلمة المرور مع خيارات الطول والأحرف والأرقام والرموز
function createPwdBlock(targetInput, onDone) {
  const box = document.createElement("div");
  box.className = "nabih-pwd-box";
  box.innerHTML = `
    <div class="nabih-pwd-row">
      <input type="text" class="nabih-pwd-val" readonly />
      <button type="button" class="nabih-pwd-refresh" title="توليد كلمة جديدة">🔄</button>
    </div>
    <div class="nabih-pwd-options">
      <div class="nabih-pwd-slider-row">
        <div class="nabih-pwd-slider-label">
          <span>الطول:</span>
          <strong class="nabih-len-val">${pwdSettings.length}</strong>
        </div>
        <input type="range" class="nabih-pwd-slider" min="6" max="36" value="${pwdSettings.length}" />
      </div>
      <div class="nabih-pwd-checks">
        <label class="nabih-pwd-chk">
          <input type="checkbox" class="nabih-chk-upper" ${pwdSettings.uppercase ? "checked" : ""} />
          <span>A-Z</span>
        </label>
        <label class="nabih-pwd-chk">
          <input type="checkbox" class="nabih-chk-num" ${pwdSettings.numbers ? "checked" : ""} />
          <span>0-9</span>
        </label>
        <label class="nabih-pwd-chk">
          <input type="checkbox" class="nabih-chk-sym" ${pwdSettings.symbols ? "checked" : ""} />
          <span>#$&</span>
        </label>
      </div>
    </div>
    <button type="button" class="nabih-pwd-fill">📋 تعبئة كلمة المرور</button>
  `;

  const valInput = box.querySelector(".nabih-pwd-val");
  const slider = box.querySelector(".nabih-pwd-slider");
  const lenVal = box.querySelector(".nabih-len-val");
  const upperChk = box.querySelector(".nabih-chk-upper");
  const numChk = box.querySelector(".nabih-chk-num");
  const symChk = box.querySelector(".nabih-chk-sym");

  function regenerate() {
    const len = parseInt(slider.value, 10);
    lenVal.textContent = len;

    pwdSettings.length = len;
    pwdSettings.uppercase = upperChk.checked;
    pwdSettings.numbers = numChk.checked;
    pwdSettings.symbols = symChk.checked;

    valInput.value = PasswordGenerator.generate(
      pwdSettings.length,
      pwdSettings.uppercase,
      pwdSettings.numbers,
      pwdSettings.symbols
    );
  }

  regenerate();

  box.querySelector(".nabih-pwd-refresh").onclick = (e) => {
    e.stopPropagation();
    regenerate();
  };

  slider.oninput = (e) => { e.stopPropagation(); regenerate(); };
  upperChk.onchange = (e) => { e.stopPropagation(); regenerate(); };
  numChk.onchange = (e) => { e.stopPropagation(); regenerate(); };
  symChk.onchange = (e) => { e.stopPropagation(); regenerate(); };

  box.querySelector(".nabih-pwd-fill").onclick = (e) => {
    e.stopPropagation();
    fillPassword(targetInput, valInput.value);
    if (onDone) onDone();
  };

  return box;
}

// إشعار رصد نموذج تسجيل
function checkAndNotifyForm() {
  if (formToastShown || !settings.showFormNotification) return;

  const hasPassword = document.querySelector('input[type="password"]');
  const forms = document.querySelectorAll("form, [role='form']");
  let isAuth = Boolean(hasPassword);

  if (!isAuth) {
    for (const form of forms) {
      const text = `${form.id || ""} ${form.className || ""} ${form.action || ""}`.toLowerCase();
      if (/\b(login|signin|sign-in|signup|sign-up|register|auth|دخول|تسجيل|اشتراك)\b/.test(text)) {
        isAuth = true;
        break;
      }
    }
  }

  if (isAuth) {
    formToastShown = true;
    detectedFormsCount = Math.max(1, forms.length);

    const toast = document.createElement("div");
    toast.className = "nabih-toast";
    toast.dir = "rtl";
    toast.innerHTML = `
      <div class="nabih-toast-header">
        <span>🛡️</span>
        <strong>تنبيه نبيه: تم رصد نموذج إدخال</strong>
        <button type="button" class="nabih-toast-close">✕</button>
      </div>
      <div class="nabih-toast-text">
        احرص على أمان بياناتك وكلمات المرور في هذا الموقع (${window.location.hostname || "الحالي"}).
      </div>
    `;
    document.body.appendChild(toast);

    const closeToast = () => toast.remove();
    toast.querySelector(".nabih-toast-close").onclick = closeToast;
    setTimeout(closeToast, 6000);
  }
}

// نافذة تلميحات واحدة مشتركة
function getTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "nabih-tooltip";
    tooltipEl.className = "nabih-tooltip";
    tooltipEl.dir = "rtl";
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.classList.remove("visible");
    tooltipEl._activeBadge = null;
  }
}

function showTooltip(badge, item) {
  const tip = getTooltip();
  const cfg = CONFIGS[item.type];
  tip._activeBadge = badge;

  tip.innerHTML = `
    <div class="nabih-tooltip-title">${cfg.icon} ${cfg.title}</div>
    <div class="nabih-tooltip-desc">${cfg.tip}</div>
  `;

  const bRect = badge.getBoundingClientRect();
  tip.style.top = `${bRect.bottom + 6}px`;
  tip.style.left = `${Math.max(10, Math.min(bRect.left, window.innerWidth - 375))}px`;
  tip.classList.add("visible");

  // مولّد كلمة المرور يظهر مع حقول كلمة المرور
  if (cfg.isPassword) {
    tip.appendChild(createPwdBlock(item.input, hideTooltip));
  }

  // البريد المؤقت يظهر فقط مع حقول البريد الإلكتروني
  if (item.type === "email") {
    tip.appendChild(createTempMailBlock(item.input));
  }
}

// ضبط موضع الزر
function positionBadge(input, badge) {
  const rect = input.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0 || input.offsetParent === null) {
    badge.style.display = "none";
    return;
  }
  badge.style.display = "inline-flex";

  const spaceRight = window.innerWidth - rect.right;
  if (spaceRight > 150) {
    badge.style.top = `${window.scrollY + rect.top + (rect.height - 24) / 2}px`;
    badge.style.left = `${window.scrollX + rect.right + 6}px`;
    badge.classList.remove("compact");
  } else {
    badge.style.top = `${window.scrollY + rect.top + (rect.height - 22) / 2}px`;
    badge.style.left = `${window.scrollX + rect.right - 26}px`;
    badge.classList.add("compact");
  }
}

// ============================================================
// نبيه | الشريط الجانبي (Sidebar) — يتم تحميله من sidebar.html
// ============================================================

let sidebarLoaded = false;
let sidebarLoadPromise = null;

async function loadSidebarFile() {
  if (sidebarLoaded && sidebarEl) return sidebarEl;
  if (sidebarLoadPromise) return sidebarLoadPromise;

  sidebarLoadPromise = (async () => {
    try {
      let html = "";
      if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
        try {
          const url = chrome.runtime.getURL("sidebar.html");
          const res = await fetch(url);
          if (res.ok) html = await res.text();
        } catch (e) { /* fallback */ }
      }
      if (!html) {
        try {
          const res = await fetch("sidebar.html");
          if (res.ok) html = await res.text();
        } catch (e) { /* fallback */ }
      }

      if (html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const aside = doc.getElementById("nabih-sidebar") || doc.querySelector("aside.nabih-sidebar");
        const toggle = doc.getElementById("nabih-sidebar-toggle") || doc.querySelector("button.nabih-sidebar-toggle");

        if (aside && !document.getElementById("nabih-sidebar")) {
          document.body.appendChild(aside);
          sidebarEl = aside;
        } else {
          sidebarEl = document.getElementById("nabih-sidebar");
        }

        if (toggle && !document.getElementById("nabih-sidebar-toggle")) {
          document.body.appendChild(toggle);
          sidebarToggle = toggle;
        } else {
          sidebarToggle = document.getElementById("nabih-sidebar-toggle");
        }
      }
    } catch (err) {
      console.warn("[Nabih] Error loading sidebar.html:", err);
    }

    // احتياطي أمان: إذا تعذر جلب الملف (مثل قيود بروتوكول file:// بدون سيرفر)
    if (!sidebarEl || !document.getElementById("nabih-sidebar")) {
      sidebarEl = document.createElement("aside");
      sidebarEl.id = "nabih-sidebar";
      sidebarEl.className = "nabih-sidebar";
      sidebarEl.dir = "rtl";
      sidebarEl.innerHTML = `
        <div class="nabih-sidebar-head ibm-plex-sans-arabic-regular">
          <strong>🔒 نبيه | لوحة التنبيهات</strong>
          <button type="button" class="nabih-sidebar-close" id="nabih-sidebar-close" title="إغلاق">✕</button>
        </div>
        <div class="nabih-sidebar-body" id="nabih-sidebar-cards">
          <div class="nabih-sidebar-empty">✅ لم يتم رصد حقول حساسة</div>
        </div>
      `;
      document.body.appendChild(sidebarEl);
    } else {
      sidebarEl = document.getElementById("nabih-sidebar");
    }

    if (!sidebarToggle || !document.getElementById("nabih-sidebar-toggle")) {
      sidebarToggle = document.createElement("button");
      sidebarToggle.id = "nabih-sidebar-toggle";
      sidebarToggle.className = "nabih-sidebar-toggle";
      sidebarToggle.type = "button";
      sidebarToggle.innerHTML = "🔒 تنبيهات نبيه";
      document.body.appendChild(sidebarToggle);
    } else {
      sidebarToggle = document.getElementById("nabih-sidebar-toggle");
    }

    // ربط الأحداث
    if (sidebarToggle && sidebarEl) {
      sidebarToggle.onclick = () => sidebarEl.classList.toggle("open");
    }
    const closeBtn = sidebarEl?.querySelector(".nabih-sidebar-close");
    if (closeBtn && sidebarEl) {
      closeBtn.onclick = () => sidebarEl.classList.remove("open");
    }

    sidebarLoaded = true;
    return sidebarEl;
  })();

  return sidebarLoadPromise;
}

async function ensureSidebar() {
  if (sidebarEl && sidebarToggle) return sidebarEl;
  return await loadSidebarFile();
}

function updateSidebarContent() {
  if (!sidebarEl) return;

  const bodyEl = sidebarEl.querySelector("#nabih-sidebar-cards");
  if (!bodyEl) return;

  bodyEl.innerHTML = "";

  if (detectedFields.length === 0) {
    bodyEl.innerHTML = '<div class="nabih-sidebar-empty">✅ لم يتم رصد حقول حساسة</div>';
    return;
  }

  // نتأكد من عدم عرض أكثر من مولد كلمة مرور واحد في نفس الوقت
  let hasPasswordGenerator = false;

  detectedFields.forEach((item) => {
    const cfg = CONFIGS[item.type];
    if (!cfg) return;

    const card = document.createElement("div");
    card.className = `nabih-sidebar-card nabih-card-${item.type}`;
    card.innerHTML = `
      <strong>${cfg.icon} ${cfg.title}</strong>
      <p>${cfg.tip}</p>
    `;

    if (item.type === "email") {
      card.appendChild(createTempMailBlock(item.input));
    }

    if (item.type === "payment") {
      const warn = document.createElement("div");
      warn.className = "nabih-payment-warn";
      warn.innerHTML = `
        <strong>💳 نصائح الدفع الآمن</strong>
        <ul>
          <li>✅ استخدم بطاقة مدفوعة مسبقاً أو بطاقة افتراضية بمبلغ محدود.</li>
          <li>✅ فعّل تنبيهات البنك اللحظية وتحقق من المبلغ قبل إدخال رمز OTP.</li>
          <li>❌ لا تحفظ البطاقة في الموقع ولا تفعل الدفع بنقرة واحدة.</li>
          <li>❌ احذر التجارب المجانية التي تتحول لاشتراكات متكررة.</li>
        </ul>
        <label class="nabih-dont-show">
          <input type="checkbox" class="nabih-payment-ignore"> لا تنبّهني في هذا الموقع
        </label>`;
      card.appendChild(warn);

      // حفظ تجاهل الموقع
      warn.querySelector(".nabih-payment-ignore").onchange = (e) => {
        if (!e.target.checked) return;
        const host = window.location.hostname;
        chrome.storage.sync.get(["nabihSettings"], ({ nabihSettings: s = {} }) => {
          const ignored = new Set(s.ignoredPaymentSites || []);
          ignored.add(host);
          chrome.storage.sync.set({ nabihSettings: { ...s, ignoredPaymentSites: [...ignored] } });
          PAYMENT_WARN = false;
          PAYMENT_TOAST = false;
          // إخفاء الإشعار المنبثق إن كان ظاهراً
          document.querySelectorAll(".nabih-toast-payment").forEach(el => el.remove());
        });
      };

      // نحدّث التنبيه بالصفحة عند فتح الشريط الجانبي
      showPaymentWarning(item);
    }

    // مولّد كلمة المرور يظهر مع حقول كلمة المرور — نمنع ظهور اثنين في نفس الوقت
    if (cfg.isPassword) {
      if (!hasPasswordGenerator) {
        card.appendChild(createPwdBlock(item.input, null));
        hasPasswordGenerator = true;
      }
    }

    const focusBtn = document.createElement("button");
    focusBtn.type = "button";
    focusBtn.className = "nabih-focus-btn";
    focusBtn.textContent = "🔍 التركيز على الحقل";
    focusBtn.onclick = () => {
      item.input.scrollIntoView({ behavior: "smooth", block: "center" });
      item.input.focus();
    };
    card.appendChild(focusBtn);

    bodyEl.appendChild(card);
  });
}

// تطبيق نمط العرض
async function applyDisplayMode() {
  const isSidebar = settings.displayMode === "sidebar";
  if (isSidebar) {
    detectedFields.forEach(item => { if (item.badge) item.badge.style.display = "none"; });
    hideTooltip();
    await ensureSidebar();
    if (sidebarEl) sidebarEl.style.display = "flex";
    if (sidebarToggle) sidebarToggle.style.display = "block";
    updateSidebarContent();
  } else {
    if (sidebarEl) {
      sidebarEl.classList.remove("open");
      sidebarEl.style.display = "none";
    }
    if (sidebarToggle) sidebarToggle.style.display = "none";
    detectedFields.forEach(item => {
      if (item.badge) positionBadge(item.input, item.badge);
    });
  }
}

// فحص الحقول وتحديث القائمة
function scanPage() {
  detectedFields = detectedFields.filter(item => {
    if (!document.body.contains(item.input)) {
      if (item.badge) item.badge.remove();
      return false;
    }
    return true;
  });

  // checkAndNotifyForm();

  const inputs = document.querySelectorAll("input:not([data-nabih])");
  const ignored = ["hidden", "submit", "checkbox", "radio", "button", "image", "file", "reset"];
  let hasNew = false;

  inputs.forEach(input => {
    if (ignored.includes(input.type)) return;
    input.setAttribute("data-nabih", "1");

    const type = detectFieldType(input);
    if (!type) return;

    hasNew = true;
    const cfg = CONFIGS[type];

    // تنبيه صفحات الدفع عند رصد حقل بيانات دفع (فقط بعد تحميل الإعدادات)
    if (type === "payment") {
      watchPaymentInput(input);
    }


    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = `nabih-badge nabih-badge-${type}`;
    badge.dir = "rtl";
    badge.innerHTML = `<span>${cfg.icon}</span><span class="nabih-badge-text">${cfg.name}</span>`;
    document.body.appendChild(badge);

    const item = { input, type, badge };
    detectedFields.push(item);

    // تنبيه فوري لصفحات الدفع — يُستدعى هنا بعد إنشاء العناصر.
    // (سابقاً كان يُستدعى قبل "const badge" فيرمي ReferenceError ويوقف الفحص كله)
    if (type === "payment" && settingsLoaded) {
      showPaymentWarning(item);
    }

    badge.onclick = (e) => {
      e.stopPropagation();
      if (tooltipEl?.classList.contains("visible") && tooltipEl._activeBadge === badge) {
        hideTooltip();
      } else {
        showTooltip(badge, item);
      }
    };

    input.addEventListener("focus", () => {
      if (settings.displayMode === "inline") positionBadge(input, badge);
    });

    if (settings.displayMode === "inline") {
      positionBadge(input, badge);
    }
  });

  if (hasNew && settings.displayMode === "sidebar") {
    if (!sidebarEl) {
      ensureSidebar().then(() => updateSidebarContent());
    } else {
      updateSidebarContent();
    }
  }

  // تحديث حيّ لعداد "حقول الدفع" في النافذة المنبثقة (تتغير مع الحقول المتأخرة)
  if (hasNew) {
    const paymentCount = detectedFields.filter(i => i.type === "payment").length;
    if (paymentCount > 0 && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "UPDATE_PAYMENT_COUNT", paymentCount }).catch(() => {});
    }
  }

  // إعادة تقييم صفحة الدفع عند أي تغيّر في DOM (لالتقاط الحقول المتأخرة/SPA)
  schedulePaymentScan();
}

// إغلاق التلميح عند النقر في الخارج
document.addEventListener("click", (e) => {
  if (tooltipEl && !tooltipEl.contains(e.target) && !e.target.closest(".nabih-badge")) {
    hideTooltip();
  }
});

// مراقبة هادئة ومجدولة بدون حلقة مفرغة
let scanTimer = null;
function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scanPage, 250);
}

const observer = new MutationObserver((mutations) => {
  const isOurChange = mutations.every(m =>
    [...m.addedNodes, ...m.removedNodes].every(n =>
      n.nodeType === 1 && typeof n.className === "string" && n.className.includes("nabih-")
    )
  );
  if (!isOurChange) scheduleScan();
});

// تحديث المواضع عند تغيير حجم الشاشة فقط
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (settings.displayMode === "inline") {
      detectedFields.forEach(item => positionBadge(item.input, item.badge));
    }
  }, 150);
}, { passive: true });

// التواصل مع نافذة الإضافة (Popup)
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "UPDATE_SETTINGS") {
      settings = { ...settings, ...msg.settings };
      applyDisplayMode();
      // تطبيق مباشر لتنبيهات الدفع (كي يُطبّق التبديل فوراً في التبويب المفتوح)
      if (typeof msg.settings.paymentWarn === "boolean") {
        PAYMENT_WARN = msg.settings.paymentWarn;
      }
      if (typeof msg.settings.paymentToast === "boolean") {
        PAYMENT_TOAST = msg.settings.paymentToast;
      }
      const ignored = (msg.settings.ignoredPaymentSites) || [];
      if (ignored.includes(window.location.hostname)) {
        PAYMENT_WARN = false;
        PAYMENT_TOAST = false;
      }
      // إعادة تقييم الصفحة (مثلاً: المستخدم فعّل التنبيه من النافذة)
      ensurePaymentPageWarning();
      sendResponse({ success: true });

    } else if (msg.type === "UPDATE_PAYMENT_COUNT") {
      // لا حاجة لعمل إضافي — العداد يُحدّث محلياً عند التحليل
      sendResponse({ success: true });

    } else if (msg.type === "GET_PAGE_STATS") {
      const paymentCount = detectedFields.filter(i => i.type === "payment").length;
      sendResponse({
        domain: window.location.hostname,
        formsCount: detectedFormsCount,
        fieldsCount: detectedFields.length,
        paymentCount
      });

    } else if (msg.type === "fillEmail") {
      // تُستخدم بواسطة زر "تعبئة الحقل في الصفحة" في نافذة الإضافة
      const item = detectedFields.find(i => i.type === "email");
      if (item) {
        item.input.value = msg.value;
        item.input.dispatchEvent(new Event("input", { bubbles: true }));
        item.input.dispatchEvent(new Event("change", { bubbles: true }));
        item.input.focus();
        item.input.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      sendResponse({ ok: !!item });
    }
    return true;
  });
}

// بدء التشغيل وتحميل الإعدادات
function init() {
  ensureSidebar();

  if (document.body) {
    scanPage();
    applyDisplayMode();
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      scanPage();
      applyDisplayMode();
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
}


let settingsLoaded = false;

if (typeof chrome !== "undefined" && chrome.storage?.sync) {
  chrome.storage.sync.get(["nabihSettings"], (res) => {
    if (res?.nabihSettings) {
      settings = { ...settings, ...res.nabihSettings };
      // تطبيق إعدادات تنبيه الدفع
      PAYMENT_WARN = settings.paymentWarn !== false;
      PAYMENT_TOAST = settings.paymentToast !== false;
      // تجاهل الموقع إذا اختار المستخدم "لا تنبّهني في هذا الموقع"
      const ignored = (res.nabihSettings.ignoredPaymentSites) || [];
      if (ignored.includes(window.location.hostname)) {
        PAYMENT_WARN = false;
        PAYMENT_TOAST = false;
      }
    }
    settingsLoaded = true;
    // الآن فقط نفّذ الفحص الأول (بعد معرفة إعدادات المستخدم)
    init();
    ensurePaymentPageWarning();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.nabihSettings) return;
    settings = { ...settings, ...changes.nabihSettings.newValue };
    applyDisplayMode();
    PAYMENT_WARN = settings.paymentWarn !== false;
    PAYMENT_TOAST = settings.paymentToast !== false;
    const ignored = (changes.nabihSettings.newValue?.ignoredPaymentSites) || [];
    if (ignored.includes(window.location.hostname)) {
      PAYMENT_WARN = false;
      PAYMENT_TOAST = false;
    }
    // إعادة تقييم الصفحة عند تغيير الإعدادات من النافذة المنبثقة (بينما التبويب مفتوح)
    if (settingsLoaded) ensurePaymentPageWarning();
  });
} else {
  settingsLoaded = true;
  init();
  ensurePaymentPageWarning();
}
