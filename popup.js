// ============================================================
// نبيه | Nabih - منطق نافذة الإضافة (Popup Script)
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const api = typeof chrome !== "undefined" ? chrome : browser;

  // عناصر الرأس والإحصائيات
  const siteDomainEl    = document.getElementById("siteDomain");
  const formsCountEl    = document.getElementById("formsCount");
  const fieldsCountEl   = document.getElementById("fieldsCount");
  const paymentCountEl  = document.getElementById("paymentCount");

  // عناصر فحص الروابط
  const scanBtn         = document.getElementById("scan-btn");
  const scanForm        = document.getElementById("scan-form");
  const scanInput       = document.getElementById("scan-input");
  const scanErrorEl     = document.getElementById("scan-error");

  // عناصر قائمة تقارير الفحص
  const scanReportsList   = document.getElementById("scanReportsList");
  const reportsCountBadge = document.getElementById("reportsCountBadge");
  const btnClearReports   = document.getElementById("btnClearReports");

  // عناصر طريقة العرض والإعدادات
  const modeInlineRadio        = document.getElementById("modeInline");
  const modeSidebarRadio       = document.getElementById("modeSidebar");
  const modeInlineLabel        = document.getElementById("modeInlineLabel");
  const modeSidebarLabel       = document.getElementById("modeSidebarLabel");
  const toggleFormNotification = document.getElementById("toggleFormNotification");
  const togglePaymentWarn      = document.getElementById("togglePaymentWarn");
  const togglePaymentToast     = document.getElementById("togglePaymentToast");

  // عناصر شاشة البريد المؤقت
  const mailAddressEl   = document.getElementById("mailAddress");
  const mailCountEl     = document.getElementById("mailCount");
  const mailListEl      = document.getElementById("mailList");
  const btnCreateMail   = document.getElementById("btnCreateMail");
  const btnRefreshInbox = document.getElementById("btnRefreshInbox");
  const btnCopyMail     = document.getElementById("btnCopyMail");
  const btnFillTab      = document.getElementById("btnFillTab");
  const statusEl        = document.getElementById("mailStatus");

  let currentAddress = null;

  // ============================================================
  // 1. طريقة عرض التنبيهات (Display Mode) والإعدادات
  // ============================================================

  function updateRadioUI() {
    const isSidebar = modeSidebarRadio.checked;
    modeInlineRadio.checked = !isSidebar;
    modeSidebarRadio.checked = isSidebar;

    if (modeInlineLabel) modeInlineLabel.classList.toggle("active", !isSidebar);
    if (modeSidebarLabel) modeSidebarLabel.classList.toggle("active", isSidebar);
  }

  // تحميل الإعدادات المحفوظة فور فتح النافذة وتطبيقها بسلاسة
  function loadSettings() {
    api.storage?.sync?.get(["nabihSettings"], (res) => {
      const s = res?.nabihSettings || {};
      const isSidebar = s.displayMode === "sidebar";

      if (modeSidebarRadio) modeSidebarRadio.checked = isSidebar;
      if (modeInlineRadio) modeInlineRadio.checked = !isSidebar;
      updateRadioUI();

      if (toggleFormNotification) {
        toggleFormNotification.checked = s.showFormNotification !== false;
      }
      if (togglePaymentWarn) {
        togglePaymentWarn.checked = s.paymentWarn !== false;
      }
      if (togglePaymentToast) {
        togglePaymentToast.checked = s.paymentToast !== false;
      }
    });
  }

  // حفظ الإعدادات وإبلاغ التبويب النشط فوراً
  function saveSettings() {
    updateRadioUI();
    const newSettings = {
      displayMode: modeSidebarRadio.checked ? "sidebar" : "inline",
      showFormNotification: toggleFormNotification ? toggleFormNotification.checked : true,
      paymentWarn: togglePaymentWarn ? togglePaymentWarn.checked : true,
      paymentToast: togglePaymentToast ? togglePaymentToast.checked : true
    };

    api.storage?.sync?.set({ nabihSettings: newSettings }, () => {
      api.tabs?.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) {
          api.tabs.sendMessage(tab.id, { type: "UPDATE_SETTINGS", settings: newSettings }, () => {
            void api.runtime?.lastError;
          });
        }
      });
    });
  }

  // ربط أحداث تغيير نمط العرض
  if (modeInlineRadio) modeInlineRadio.addEventListener("change", saveSettings);
  if (modeSidebarRadio) modeSidebarRadio.addEventListener("change", saveSettings);

  if (modeInlineLabel) {
    modeInlineLabel.addEventListener("click", (e) => {
      if (e.target !== modeInlineRadio) {
        modeInlineRadio.checked = true;
        modeSidebarRadio.checked = false;
        saveSettings();
      }
    });
  }

  if (modeSidebarLabel) {
    modeSidebarLabel.addEventListener("click", (e) => {
      if (e.target !== modeSidebarRadio) {
        modeSidebarRadio.checked = true;
        modeInlineRadio.checked = false;
        saveSettings();
      }
    });
  }

  if (toggleFormNotification) toggleFormNotification.addEventListener("change", saveSettings);
  if (togglePaymentWarn) togglePaymentWarn.addEventListener("change", saveSettings);
  if (togglePaymentToast) togglePaymentToast.addEventListener("change", saveSettings);

  loadSettings();

  // ============================================================
  // 2. فحص الروابط (URL Scanner)
  // ============================================================

  function normalize(raw) {
    let value = (raw || "").trim();
    if (!value) throw new Error("أدخل رابطًا أولًا.");
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = "https://" + value;
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("الرابط غير صالح.");
    }
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname.includes(".")) {
      throw new Error("أدخل رابط http:// أو https:// صالحًا.");
    }
    return parsed.href;
  }

  function goScan(url) {
    location.href = "vt-scan.html?url=" + encodeURIComponent(url);
  }

  // 1) فحص رابط مخصص يدوي
  if (scanForm) {
    scanForm.addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        if (scanErrorEl) scanErrorEl.textContent = "";
        if (scanInput) scanInput.classList.remove("invalid");
        const cleanUrl = normalize(scanInput?.value);
        goScan(cleanUrl);
      } catch (err) {
        if (scanErrorEl) scanErrorEl.textContent = err.message;
        if (scanInput) {
          scanInput.classList.add("invalid");
          scanInput.focus();
        }
      }
    });
  }

  if (scanInput) {
    scanInput.addEventListener("input", () => {
      if (scanErrorEl) scanErrorEl.textContent = "";
      scanInput.classList.remove("invalid");
    });
  }

  // 2) فحص الصفحة الحالية
  if (scanBtn) {
    scanBtn.addEventListener("click", async () => {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      try {
        const cleanUrl = normalize(tab?.url || "");
        goScan(cleanUrl);
      } catch {
        if (scanErrorEl) scanErrorEl.textContent = "لا يمكن فحص هذه الصفحة.";
      }
    });
  }

  // ============================================================
  // 3. تقارير الفحص السابقة (Scan Reports List)
  // ============================================================

  function renderReports() {
    if (!scanReportsList) return;

    api.storage?.local?.get(["nabihScanReports"], (res) => {
      const list = Array.isArray(res?.nabihScanReports) ? res.nabihScanReports : [];

      if (reportsCountBadge) {
        reportsCountBadge.textContent = String(list.length);
      }
      if (btnClearReports) {
        btnClearReports.style.display = list.length > 0 ? "inline-block" : "none";
      }

      if (list.length === 0) {
        scanReportsList.innerHTML = '<div class="reports-empty">لا توجد تقارير فحص سابقة</div>';
        return;
      }

      scanReportsList.innerHTML = "";
      list.forEach((report) => {
        const card = document.createElement("div");
        const vClass = report.verdict === "malicious" ? "verdict-malicious" :
                       report.verdict === "suspicious" ? "verdict-suspicious" : "verdict-clean";
        const tagClass = report.verdict === "malicious" ? "tag-malicious" :
                         report.verdict === "suspicious" ? "tag-suspicious" : "tag-clean";
        const icon = report.verdict === "malicious" ? "🔴" :
                     report.verdict === "suspicious" ? "🟡" : "🟢";

        const totalScans = (report.stats?.malicious || 0) + (report.stats?.suspicious || 0) +
                           (report.stats?.harmless || 0) + (report.stats?.undetected || 0);
        const score = `${report.stats?.malicious || 0}/${totalScans || 90}`;

        const timeStr = report.timestamp
          ? new Date(report.timestamp).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })
          : "";

        card.className = `report-card ${vClass}`;
        card.innerHTML = `
          <div class="report-top">
            <div class="report-domain-wrap">
              <span class="report-verdict-icon">${icon}</span>
              <span class="report-domain" title="${report.url}">${report.domain || report.url}</span>
            </div>
            <span class="report-tag ${tagClass}">${report.verdictText || "فحص"} (${score})</span>
          </div>
          <div class="report-bottom">
            <span class="report-time">${timeStr ? "الوقت " + timeStr : ""}</span>
            <div class="report-links">
              <a href="vt-scan.html?url=${encodeURIComponent(report.url)}" class="report-link-btn">عرض النتيجة</a>
              <button type="button" class="report-delete-btn" title="حذف هذا التقرير">✕</button>
            </div>
          </div>
        `;

        card.querySelector(".report-delete-btn").onclick = (e) => {
          e.stopPropagation();
          deleteReport(report.url);
        };

        scanReportsList.appendChild(card);
      });
    });
  }

  function deleteReport(url) {
    api.storage?.local?.get(["nabihScanReports"], (res) => {
      const list = Array.isArray(res?.nabihScanReports) ? res.nabihScanReports : [];
      const updated = list.filter((r) => r.url !== url);
      api.storage?.local?.set({ nabihScanReports: updated }, () => {
        renderReports();
      });
    });
  }

  if (btnClearReports) {
    btnClearReports.onclick = () => {
      if (confirm("هل تريد مسح جميع تقارير الفحص السابقة؟")) {
        api.storage?.local?.set({ nabihScanReports: [] }, () => {
          renderReports();
        });
      }
    };
  }

  renderReports();

  // تحديث القائمة تلقائياً عند إضافة أي تقرير فحص جديد
  api.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes.nabihScanReports) {
      renderReports();
    }
  });

  // ============================================================
  // 4. عناصر وإحصائيات التبويب النشط
  // ============================================================

  api.tabs?.query({ active: true, currentWindow: true }, ([tab]) => {
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
      if (res.domain) siteDomainEl.textContent = res.domain;
    });

    const livePm = (msg) => {
      if (msg?.type === "UPDATE_PAYMENT_COUNT" && paymentCountEl && msg.paymentCount > 0) {
        paymentCountEl.textContent = String(msg.paymentCount);
      }
    };
    api.runtime?.onMessage?.addListener(livePm);
  });

  // ============================================================
  // 5. عناصر البريد المؤقت (Temp Mail)
  // ============================================================

  function setAddress(addr) {
    currentAddress = addr;
    if (mailAddressEl) mailAddressEl.innerHTML = `<span dir="ltr">${addr}</span>`;
    [btnRefreshInbox, btnCopyMail, btnFillTab].forEach((el) => {
      if (el) el.disabled = false;
    });
    if (mailCountEl) mailCountEl.textContent = "0";
  }

  function renderMessageBody(row, full, code, links) {
    let body = row.querySelector(".temp-mail-body");
    if (body) body.remove();
    body = document.createElement("div");
    body.className = "temp-mail-body";

    if (code) {
      const c = document.createElement("div");
      c.className = "temp-mail-code";
      c.textContent = code;
      c.title = "انقر لنسخ كود التحقق";
      c.onclick = async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(code);
        if (statusEl) statusEl.textContent = `✓ ${code}`;
      };
      body.appendChild(c);
    }

    if (links.length) {
      const lb = document.createElement("div");
      lb.className = "temp-mail-links";
      links.forEach((u) => {
        const a = document.createElement("a");
        a.className = "temp-mail-link";
        a.href = u;
        a.textContent = u.length > 60 ? u.slice(0, 57) + "…" : u;
        a.title = u;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.onclick = (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(u);
          if (statusEl) statusEl.textContent = "✓ تم نسخ الرابط";
        };
        lb.appendChild(a);
      });
      body.appendChild(lb);
    }

    const pre = document.createElement("pre");
    pre.className = "temp-mail-pre";
    pre.textContent = (full.html || full.text || "").replace(/\s+\n/g, "\n").trim().slice(0, 4000);
    body.appendChild(pre);

    row.appendChild(body);
  }

  async function callApi(type, payload = {}) {
    const res = await api.runtime.sendMessage({ type, ...payload });
    if (!res?.ok) throw new Error(res?.error || "لا استجابة من خدمة البريد");
    return res.data;
  }

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
          const total = list.total && list.total !== list.length ? list.total : null;
          if (mailCountEl) mailCountEl.textContent = total ? `${list.length}+/${total}` : String(list.length);

          const items = Array.isArray(list) ? list : (list.items || []);
          items.forEach((m) => {
            const row = document.createElement("div");
            row.className = "temp-mail-msg" + (m.seen ? "" : " unread");

            const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "";
            row.innerHTML = `<strong>${m.subject || "(بدون موضوع)"}</strong>` +
              `<p>${m.intro ? m.intro + "…" : ""}</p>` +
              `<small>${m.from?.address || ""}${time ? " • " + time : ""}${m.hasAttachments ? " 📎" : ""}</small>`;

            let cache = null;
            const ensureFull = async () => {
              if (cache) return cache;
              const full = await callApi("read", { id: m.id });
              cache = full;
              if (!m.seen) { m.seen = true; row.classList.remove("unread"); }
              return full;
            };

            row.onclick = async (ev) => {
              try {
                const full = await ensureFull();
                ev.preventDefault();
                const links = Array.isArray(full.links) ? full.links : [];
                const code = full.code || null;
                const toCopy = code || links[0] || full.text || "";
                if (toCopy) await navigator.clipboard.writeText(toCopy);

                renderMessageBody(row, full, code, links);

                if (code) statusEl.textContent = `✓ تم نسخ الكود: ${code}`;
                else if (links[0]) statusEl.textContent = "✓ تم نسخ الرابط، وفتح الأول";
                else statusEl.textContent = "✓ تم نسخ النص";

                if (links.length && !ev.target.closest(".temp-mail-link")) {
                  api.tabs.create ? api.tabs.create({ url: links[0], active: false }) : window.open(links[0], "_blank", "noopener");
                }
              } catch (e) {
                if (statusEl) statusEl.textContent = "خطأ: " + e.message;
              }
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
        if (statusEl) statusEl.textContent = "✓ تم نسخ العنوان بنجاح";
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
  api.storage?.local?.get(["nabihTempMail", "address"], (res) => {
    const addr = res?.nabihTempMail || res?.address;
    if (addr) {
      setAddress(addr);
      if (mailCountEl) mailCountEl.textContent = "…";
      if (btnRefreshInbox) btnRefreshInbox.click();
    }
  });
});
