// ============================================================
// نبيه | Nabih - منطق نافذة الإضافة (Popup Script)
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const api = typeof chrome !== "undefined" ? chrome : browser;

  const siteDomainEl  = document.getElementById("siteDomain");
  const formsCountEl  = document.getElementById("formsCount");
  const fieldsCountEl = document.getElementById("fieldsCount");
  const paymentCountEl = document.getElementById("paymentCount");

  const modeInlineRadio         = document.getElementById("modeInline");
  const modeSidebarRadio        = document.getElementById("modeSidebar");
  const modeInlineLabel         = document.getElementById("modeInlineLabel");
  const modeSidebarLabel        = document.getElementById("modeSidebarLabel");
  const toggleFormNotification  = document.getElementById("toggleFormNotification");
  const togglePaymentWarn       = document.getElementById("togglePaymentWarn");
  const togglePaymentToast      = document.getElementById("togglePaymentToast");

  // ===== عناصر شاشة البريد المؤقت =====
  const mailAddressEl = document.getElementById("mailAddress");
  const mailCountEl   = document.getElementById("mailCount");
  const mailListEl    = document.getElementById("mailList");
  const btnCreateMail = document.getElementById("btnCreateMail");
  const btnRefreshInbox = document.getElementById("btnRefreshInbox");
  const btnCopyMail   = document.getElementById("btnCopyMail");
  const btnFillTab    = document.getElementById("btnFillTab");

  let currentAddress = null;

  function updateRadioUI() {
    const isInline = modeInlineRadio.checked;
    modeInlineLabel.classList.toggle("active", isInline);
    modeSidebarLabel.classList.toggle("active", !isInline);
  }

  // تعيين العنوان في الواجهة وتفعيل الأزرار
  function setAddress(addr) {
    currentAddress = addr;
    mailAddressEl.innerHTML = `<span dir="ltr">${addr}</span>`;
    [btnRefreshInbox, btnCopyMail, btnFillTab].forEach(el => { if (el) el.disabled = false; });
    if (mailCountEl) mailCountEl.textContent = "0";
  }

  const statusEl = document.getElementById("mailStatus");

  // عرض جسم الرسالة الكاملة: روابط قابلة للنقر + كود التحقق + النص/الأتش تي ام أل
  function renderMessageBody(row, full, code, links) {
    // نترك الهيكلة الحالية (الموضوع/المقتطف) ونلحق شريط الروابط
    let body = row.querySelector(".temp-mail-body");
    if (body) body.remove();
    body = document.createElement("div");
    body.className = "temp-mail-body";

    if (code) {
      const c = document.createElement("div");
      c.className = "temp-mail-code";
      c.textContent = code;
      c.title = "انقر لنسخ كود التحقق";
      c.onclick = async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(code); if (statusEl) statusEl.textContent = `✓ ${code}`; };
      body.appendChild(c);
    }

    if (links.length) {
      const lb = document.createElement("div");
      lb.className = "temp-mail-links";
      links.forEach(u => {
        const a = document.createElement("a");
        a.className = "temp-mail-link";
        a.href = u;
        a.textContent = u.length > 60 ? u.slice(0, 57) + "…" : u;
        a.title = u;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.onclick = (e) => {
          e.stopPropagation();                 // نمنع فتح الرابط المزدوج
          navigator.clipboard.writeText(u);    // النسخ التلقائي مفيد هنا
          if (statusEl) statusEl.textContent = "✓ تم نسخ الرابط";
        };
        lb.appendChild(a);
      });
      body.appendChild(lb);
    }

    // نص الرسالة (نعرض الأتش تي ام أل إن وُجد، وإلا النص العادي)
    const pre = document.createElement("pre");
    pre.className = "temp-mail-pre";
    pre.textContent = (full.html || full.text || "").replace(/\s+\n/g, "\n").trim().slice(0, 4000);
    body.appendChild(pre);

    row.appendChild(body);
  }

    // إرسال أمر للخلفية (tempMail.js) مع معالجة الأخطاء  // إرسال أمر للخلفية (tempMail.js) مع معالجة الأخطاء
  async function callApi(type, payload = {}) {
    const res = await api.runtime.sendMessage({ type, ...payload });
    if (!res?.ok) throw new Error(res?.error || "لا استجابة من خدمة البريد");
    return res.data;
  }

  // ===== أحداث البريد المؤقت =====
  if (btnCreateMail) {
    btnCreateMail.onclick = async () => {
      btnCreateMail.disabled = true;
      try {
        const { address } = await callApi("create");
        setAddress(address);
        if (mailCountEl) mailCountEl.textContent = "…";
        if (btnRefreshInbox) btnRefreshInbox.click();
      } catch (e) {
        alert("تعذّر إنشاء البريد: " + e.message);
      } finally {
        btnCreateMail.disabled = false;
      }
    };
  }

  if (btnRefreshInbox) {
    btnRefreshInbox.onclick = async () => {
      btnRefreshInbox.disabled = true;
      try {
        const list = await callApi("inbox");
        if (mailCountEl) mailCountEl.textContent = String(list.length);
        if (mailListEl) {
          // الملخص لا يحتوي على النص الكامل (المستند: الملخص بلا "intro" أحياناً)؛
          // نجلب الرسالة كاملة مرة واحدة في الخلفية لتوفير الروابط والكود
          mailListEl.innerHTML = list.length ? "" : '<div class="temp-mail-msg">الصندوق فارغ</div>';

          // إجمالي الرسائل قد يكون > 30 (صفحة واحدة)، نوضح ذلك في العداد
          const total = list.total && list.total !== list.length ? list.total : null;
          if (mailCountEl) mailCountEl.textContent = total ? `${list.length}+/${total}` : String(list.length);

          list.items.forEach(m => {
            const row = document.createElement("div");
            row.className = "temp-mail-msg" + (m.seen ? "" : " unread");

            // ملخص: موضوع + مقتطف + مرسل + وقت + مؤشر مرفقات
            const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "";
            row.innerHTML = `<strong>${m.subject || "(بدون موضوع)"}</strong>` +
              `<p>${m.intro ? m.intro + "…" : ""}</p>` +
              `<small>${m.from?.address || ""}${time ? " • " + time : ""}${m.hasAttachments ? " 📎" : ""}</small>`;

            // جلب الرسالة كاملة (خلفية) لاستخراج الروابط وكود التحقق
            let cache = null;
            const ensureFull = async () => {
              if (cache) return cache;
              const full = await callApi("read", { id: m.id });
              cache = full;
              if (!m.seen) { m.seen = true; row.classList.remove("unread"); }
              return full;
            };

            // نقر على الصف: نسخ الأولوية (كود ← رابط ← نص) + فتح أول رابط تحقق
            row.onclick = async (ev) => {
              try {
                const full = await ensureFull();
                ev.preventDefault();

                const links = Array.isArray(full.links) ? full.links : [];
                const code = full.code || null;

                // النسخ: كود التحقق أولاً (لأنه الهدف الأشهر)، وإلا أول رابط، وإلا النص
                const toCopy = code || links[0] || full.text || "";
                if (toCopy) await navigator.clipboard.writeText(toCopy);

                // عرض شريط الإجراءات تحت الرسالة (روابط قابلة للنقر + كود)
                renderMessageBody(row, full, code, links);

                if (code) statusEl.textContent = `✓ تم نسخ الكود: ${code}`;
                else if (links[0]) statusEl.textContent = "✓ تم نسخ الرابط، وفتح الأول";
                else statusEl.textContent = "✓ تم نسخ النص";

                // فتح رابط التحقق في تبويب جديد (إذا لم يكن النقر على رابط داخلي)
                if (links.length && !ev.target.closest(".temp-mail-link")) {
                  api.tabs.create ? api.tabs.create({ url: links[0], active: false }) : window.open(links[0], "_blank", "noopener");
                }
              } catch (e) {
                if (statusEl) statusEl.textContent = "خطأ: " + e.message;
              }
            };

            mailListEl.appendChild(row);
          });

          if (total) {
            const note = document.createElement("div");
            note.className = "temp-mail-msg";
            note.style.cssText = "font-size:11px;color:var(--muted,#7b8494);text-align:center";
            note.textContent = `تظهر أحدث 30 رسالة فقط؛ المجموع ${total}. اضغط "تحديث الصندوق" للتحقق من الوارد.`;
            mailListEl.appendChild(note);
          }
        }
      } catch (e) {
        if (mailListEl) mailListEl.innerHTML = `<div class="temp-mail-msg">خطأ: ${e.message}</div>`;
      } finally {
        btnRefreshInbox.disabled = false;
      }
    };
  }

  if (btnCopyMail) {
    btnCopyMail.onclick = async () => {
      if (!currentAddress) return;
      try {
        await navigator.clipboard.writeText(currentAddress);
      } catch (e) { console.error(e); }
    };
  }

  if (btnFillTab) {
    btnFillTab.onclick = async () => {
      if (!currentAddress) return;
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        api.tabs.sendMessage(tab.id, { type: "fillEmail", value: currentAddress }, (resp) => {
          void api.runtime?.lastError;
          if (statusEl) {
            if (resp?.ok) {
              statusEl.textContent = "✓ تم تعبئة البريد في الصفحة";
              statusEl.style.color = "#34d399";
            } else {
              statusEl.textContent = "لم يتم العثور على حقل بريد في الصفحة";
              statusEl.style.color = "#f87171";
            }
          }
        });
      }
    };
  }

  // استعادة العنوان السابق عند فتح النافذة
  api?.storage?.local?.get(["nabihTempMail", "address"], (res) => {
    const addr = res?.nabihTempMail || res?.address;
    if (addr) {
      setAddress(addr);
      if (mailCountEl) mailCountEl.textContent = "…";
      if (btnRefreshInbox) btnRefreshInbox.click();
    }
  });

  // ===== إحصائيات الصفحة الحالية =====
  api?.tabs?.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    try {
      siteDomainEl.textContent = new URL(tab.url).hostname || "صفحة محلية";
    } catch {
      siteDomainEl.textContent = "الصفحة الحالية";
    }

    api.tabs.sendMessage(tab.id, { type: "GET_PAGE_STATS" }, (res) => {
      if (api.runtime?.lastError || !res) return;
      if (formsCountEl) formsCountEl.textContent = res.formsCount || "0";
      if (fieldsCountEl) fieldsCountEl.textContent = res.fieldsCount || "0";
      if (paymentCountEl) paymentCountEl.textContent = res.paymentCount || "0";
    });

    // تحديث حيّ لعداد "حقول الدفع" عند اكتشاف حقول متأخرة في الصفحة
    const livePm = (msg) => {
      if (msg?.type === "UPDATE_PAYMENT_COUNT" && paymentCountEl && msg.paymentCount > 0) {
        paymentCountEl.textContent = String(msg.paymentCount);
      }
    };
    api?.runtime?.onMessage?.addListener(livePm);

    if (res.domain) siteDomainEl.textContent = res.domain;
  });
});

  // ===== تحميل الإعدادات المحفوظة =====
  api?.storage?.sync?.get(["nabihSettings"], (res) => {
    const s = res?.nabihSettings;
    if (s) {
      modeSidebarRadio.checked  = s.displayMode === "sidebar";
      modeInlineRadio.checked   = s.displayMode !== "sidebar";
      if (typeof s.showFormNotification === "boolean") {
        toggleFormNotification.checked = s.showFormNotification;
      }
      // افتراضي true — التنبيه مفعل افتراضياً للمستخدمين الجدد
      if (togglePaymentWarn) togglePaymentWarn.checked = s.paymentWarn !== false;
      if (togglePaymentToast) togglePaymentToast.checked = s.paymentToast !== false;
    } else {
      // قيم افتراضية عند أول استخدام
      if (togglePaymentWarn) togglePaymentWarn.checked = true;
      if (togglePaymentToast) togglePaymentToast.checked = true;
    }
    updateRadioUI();
  });

  // ===== حفظ الإعدادات وإبلاغ التبويب النشط =====
  function saveSettings() {
    updateRadioUI();
    const newSettings = {
      displayMode: modeSidebarRadio.checked ? "sidebar" : "inline",
      showFormNotification: toggleFormNotification.checked,
      paymentWarn: togglePaymentWarn ? togglePaymentWarn.checked : true,
      paymentToast: togglePaymentToast ? togglePaymentToast.checked : true
    };

    api?.storage?.sync?.set({ nabihSettings: newSettings }, () => {
      api.tabs?.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) {
          api.tabs.sendMessage(tab.id, { type: "UPDATE_SETTINGS", settings: newSettings }, () => {
            void api.runtime?.lastError;
          });
        }
      });
    });
  }

  modeInlineRadio.onchange   = saveSettings;
  modeSidebarRadio.onchange  = saveSettings;
  toggleFormNotification.onchange = saveSettings;
  if (togglePaymentWarn) togglePaymentWarn.onchange = saveSettings;
  if (togglePaymentToast) togglePaymentToast.onchange = saveSettings;

