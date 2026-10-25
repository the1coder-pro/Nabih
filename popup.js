// ============================================================
// نبيه | Nabih - منطق نافذة الإضافة (Popup Script)
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const api = typeof chrome !== "undefined" ? chrome : browser;

  const siteDomainEl  = document.getElementById("siteDomain");
  const formsCountEl  = document.getElementById("formsCount");
  const fieldsCountEl = document.getElementById("fieldsCount");

  const modeInlineRadio         = document.getElementById("modeInline");
  const modeSidebarRadio        = document.getElementById("modeSidebar");
  const modeInlineLabel         = document.getElementById("modeInlineLabel");
  const modeSidebarLabel        = document.getElementById("modeSidebarLabel");
  const toggleFormNotification  = document.getElementById("toggleFormNotification");

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

  // إرسال أمر للخلفية (tempMail.js) مع معالجة الأخطاء
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
          mailListEl.innerHTML = list.length ? "" : '<div class="temp-mail-msg">الصندوق فارغ</div>';
          list.forEach(m => {
            const row = document.createElement("div");
            row.className = "temp-mail-msg" + (m.seen ? "" : " unread");
            row.innerHTML = `<strong>${m.subject || "(بدون موضوع)"}</strong>` +
              `<p>${m.intro || ""}</p><small>${m.from?.address || ""}</small>`;
            row.onclick = async () => {
              try {
                const full = await callApi("read", { id: m.id });
                await navigator.clipboard.writeText(full.text || "");
                row.classList.remove("unread");
              } catch (e) { console.error(e); }
            };
            mailListEl.appendChild(row);
          });
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
        api.tabs.sendMessage(tab.id, { type: "fillEmail", value: currentAddress }, () => {
          void api.runtime?.lastError;
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
    }
    updateRadioUI();
  });

  // ===== حفظ الإعدادات وإبلاغ التبويب النشط =====
  function saveSettings() {
    updateRadioUI();
    const newSettings = {
      displayMode: modeSidebarRadio.checked ? "sidebar" : "inline",
      showFormNotification: toggleFormNotification.checked
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
});
