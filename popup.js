// ============================================================
// نبيه | Nabih - منطق نافذة الإضافة (Popup Script)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const api = typeof chrome !== 'undefined' ? chrome : browser;
  const siteDomainEl = document.getElementById('siteDomain');
  const formsCountEl = document.getElementById('formsCount');
  const fieldsCountEl = document.getElementById('fieldsCount');

  const modeInlineRadio = document.getElementById('modeInline');
  const modeSidebarRadio = document.getElementById('modeSidebar');
  const modeInlineLabel = document.getElementById('modeInlineLabel');
  const modeSidebarLabel = document.getElementById('modeSidebarLabel');
  const toggleFormNotification = document.getElementById('toggleFormNotification');

  function updateRadioUI() {
    const isInline = modeInlineRadio.checked;
    modeInlineLabel.classList.toggle('active', isInline);
    modeSidebarLabel.classList.toggle('active', !isInline);
  }

  // جلب إحصائيات الصفحة الحالية
  api?.tabs?.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    try {
      siteDomainEl.textContent = new URL(tab.url).hostname || 'صفحة محلية';
    } catch {
      siteDomainEl.textContent = 'الصفحة الحالية';
    }

    api.tabs.sendMessage(tab.id, { type: 'GET_PAGE_STATS' }, (res) => {
      if (api.runtime?.lastError || !res) return;
      formsCountEl.textContent = res.formsCount || '0';
      fieldsCountEl.textContent = res.fieldsCount || '0';
      if (res.domain) siteDomainEl.textContent = res.domain;
    });
  });

  // تحميل الإعدادات المحفوظة
  api?.storage?.sync?.get(['nabihSettings'], (res) => {
    const s = res?.nabihSettings;
    if (s) {
      modeSidebarRadio.checked = s.displayMode === 'sidebar';
      modeInlineRadio.checked = s.displayMode !== 'sidebar';
      if (typeof s.showFormNotification === 'boolean') {
        toggleFormNotification.checked = s.showFormNotification;
      }
    }
    updateRadioUI();
  });

  // حفظ الإعدادات وإبلاغ التبويب النشط
  function saveSettings() {
    updateRadioUI();
    const newSettings = {
      displayMode: modeSidebarRadio.checked ? 'sidebar' : 'inline',
      showFormNotification: toggleFormNotification.checked
    };

    api?.storage?.sync?.set({ nabihSettings: newSettings }, () => {
      api.tabs?.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) {
          api.tabs.sendMessage(tab.id, { type: 'UPDATE_SETTINGS', settings: newSettings }, () => {
            void api.runtime?.lastError;
          });
        }
      });
    });
  }

  modeInlineRadio.onchange = saveSettings;
  modeSidebarRadio.onchange = saveSettings;
  toggleFormNotification.onchange = saveSettings;
});
