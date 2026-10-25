// ============================================================
// نبيه | Nabih - أداة الوعي الأمني وحماية البيانات
// ============================================================

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

// الكشف عن نوع الحقل بسرعة وبدون layout thrashing
function detectFieldType(input) {
  const type = (input.type || "").toLowerCase();
  if (type === "password") return "password";
  if (type === "email") return "email";
  if (type === "tel") return "phone";
  

  const attrs = `${input.name || ""} ${input.id || ""} ${input.placeholder || ""} ${input.autocomplete || ""}`.toLowerCase();
  if (/\b(password|pwd|secret|كلمة المرور|السر)\b/i.test(attrs) && !/\bpassport\b/i.test(attrs)) return "password";
  if (/\b(email|mail|بريد|ايميل)\b/i.test(attrs)) return "email";
  if (/\b(phone|mobile|tel|هاتف|جوال)\b/i.test(attrs)) return "phone";
  if (/\b(username|user|login|اسم المستخدم|المعرف)\b/i.test(attrs)) return "username";

  let labelText = "";
  if (input.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (lbl) labelText += " " + lbl.textContent;
  }
  const parent = input.closest("label");
  if (parent) labelText += " " + parent.textContent;

  if (labelText) {
    labelText = labelText.toLowerCase();
    if (/\b(password|كلمة المرور|السر)\b/i.test(labelText)) return "password";
    if (/\b(email|بريد|ايميل)\b/i.test(labelText)) return "email";
    if (/\b(phone|هاتف|جوال)\b/i.test(labelText)) return "phone";
    if (/\b(username|اسم المستخدم)\b/i.test(labelText)) return "username";
  }
  return null;
}

// تعبئة كلمة المرور في الحقل وحقل التأكيد
function fillPassword(targetInput, value) {
  targetInput.value = value;
  targetInput.dispatchEvent(new Event("input", { bubbles: true }));
  targetInput.dispatchEvent(new Event("change", { bubbles: true }));

  const form = targetInput.closest("form");
  if (form) {
    form.querySelectorAll('input[type="password"]').forEach(p => {
      if (p !== targetInput) {
        p.value = value;
        p.dispatchEvent(new Event("input", { bubbles: true }));
        p.dispatchEvent(new Event("change", { bubbles: true }));
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
  const inboxBtn = box.querySelector(".nabih-tm-inbox");
  const msgBox = box.querySelector(".nabih-tm-messages");
  let address = null;

  function status(text, ok) {
    metaStatus.textContent = text || "";
    metaStatus.style.color = ok === false ? "#f87171" : "#34d399";
  }

  function render(list = []) {
    metaCount.textContent = list.length + " رسالة" + (list.length === 0 || list.length === 1 ? "" : "ات");
    msgBox.innerHTML = list.length ? "" : '<div class="nabih-tm-empty">الصندوق فارغ</div>';
    list.forEach(m => {
      const row = document.createElement("div");
      row.className = "nabih-tm-msg" + (m.seen ? "" : " nabih-tm-unread");
      row.innerHTML = `<strong>${m.subject || "(بدون موضوع)"}</strong>
        <small>${m.from?.address || ""}</small>`;
      row.onclick = async () => {
        status("جاري القراءة…");
        const r = await chrome.runtime.sendMessage({ type: "read", id: m.id });
        if (r?.ok) {
          targetInput.value = m.subject.includes("كود") || m.subject.includes("رمز") || m.subject.includes("code")
              ? (r.data.text || "").match(new RegExp(String.raw`\b\d{4,8}\b`))?.[0] || r.data.text || ""
              : r.data.text || "";
          targetInput.dispatchEvent(new Event("input", { bubbles: true }));
          navigator.clipboard.writeText(r.data.text || "").catch(() => {});
          row.classList.remove("nabih-tm-unread");
          status("تم النسخ");
        } else {
          status("خطأ: " + (r?.error || "لا استجابة"), false);
        }
      };
      msgBox.appendChild(row);
    });
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
      targetInput.value = address;
      targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      await chrome.storage.local.set({ nabihTempMail: address });
      status("تم الإنشاء");
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
      metaCount.textContent = "0 رسالة";
      status("تم استعادة العنوان");
    }
  });

  return box;
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
  tip.style.left = `${Math.max(10, Math.min(bRect.left, window.innerWidth - 290))}px`;
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

// الشريط الجانبي
function getSidebar() {
  if (!sidebarEl) {
    sidebarEl = document.createElement("aside");
    sidebarEl.id = "nabih-sidebar";
    sidebarEl.className = "nabih-sidebar";
    sidebarEl.dir = "rtl";

    sidebarToggle = document.createElement("button");
    sidebarToggle.id = "nabih-sidebar-toggle";
    sidebarToggle.className = "nabih-sidebar-toggle";
    sidebarToggle.type = "button";
    sidebarToggle.innerHTML = "🔒 تنبيهات نبيه";
    sidebarToggle.onclick = () => sidebarEl.classList.toggle("open");

    document.body.appendChild(sidebarEl);
    document.body.appendChild(sidebarToggle);
  }
  return sidebarEl;
}

function updateSidebarContent() {
  if (!sidebarEl) return;

  sidebarEl.innerHTML = `
    <div class="nabih-sidebar-head">
      <strong>🔒 نبيه | لوحة التنبيهات</strong>
      <button type="button" class="nabih-sidebar-close">✕</button>
    </div>
    <div class="nabih-sidebar-body" id="nabih-sidebar-cards"></div>
  `;

  sidebarEl.querySelector(".nabih-sidebar-close").onclick = () => {
    sidebarEl.classList.remove("open");
  };

  const bodyEl = sidebarEl.querySelector("#nabih-sidebar-cards");
  if (detectedFields.length === 0) {
    bodyEl.innerHTML = '<div class="nabih-sidebar-empty">✅ لم يتم رصد حقول حساسة</div>';
    return;
  }

  detectedFields.forEach((item) => {
    const cfg = CONFIGS[item.type];
    const card = document.createElement("div");
    card.className = `nabih-sidebar-card nabih-card-${item.type}`;
    card.innerHTML = `
      <strong>${cfg.icon} ${cfg.title}</strong>
      <p>${cfg.tip}</p>
    `;

    if (item.type === "email") {
      card.appendChild(createTempMailBlock(item.input));
    }

    if (cfg.isPassword) {
      card.appendChild(createPwdBlock(item.input, null));
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
function applyDisplayMode() {
  const isSidebar = settings.displayMode === "sidebar";
  if (isSidebar) {
    detectedFields.forEach(item => { if (item.badge) item.badge.style.display = "none"; });
    hideTooltip();
    getSidebar();
    sidebarEl.style.display = "flex";
    sidebarToggle.style.display = "block";
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

    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = `nabih-badge nabih-badge-${type}`;
    badge.dir = "rtl";
    badge.innerHTML = `<span>${cfg.icon}</span><span class="nabih-badge-text">${cfg.name}</span>`;
    document.body.appendChild(badge);

    const item = { input, type, badge };
    detectedFields.push(item);

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
    updateSidebarContent();
  }
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
      sendResponse({ success: true });

    } else if (msg.type === "GET_PAGE_STATS") {
      sendResponse({
        domain: window.location.hostname,
        formsCount: detectedFormsCount,
        fieldsCount: detectedFields.length
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
  if (document.body) {
    scanPage();
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      scanPage();
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
}

if (typeof chrome !== "undefined" && chrome.storage?.sync) {
  chrome.storage.sync.get(["nabihSettings"], (res) => {
    if (res?.nabihSettings) settings = { ...settings, ...res.nabihSettings };
    init();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.nabihSettings) {
      settings = { ...settings, ...changes.nabihSettings.newValue };
      applyDisplayMode();
    }
  });
} else {
  init();
}


