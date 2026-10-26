/* ============================================================
   نبيه | عارض الرسائل (Mail Renderer)  —  mailRender.js
   ------------------------------------------------------------
   المشكلة التي يعالجها هذا الملف:
   كانت الرسالة تُعرض كنص خام داخل <pre> (كود HTML ظاهر للمستخدم)
   ومقطوعة عند 4000 حرف، ومحقونة بـ innerHTML بدون تعقيم،
   فتظهر ناقصة أو مشوّهة أو تُفسد تنسيق النافذة.
   الحل:
   1) تعقيم HTML الرسالة (بدون سكربتات/نماذج/صور تتبّع/روابط javascript)
   2) عرض المحتوى كاملاً (بدون أي اقتطاع) داخل iframe معزول
   3) شريط أدوات: HTML/نص — الصور — توسيع — نسخ — حذف
   4) كود التحقق + الروابط + المرفقات في مكان واضح
   يُستخدم من: popup.js  •  content.js  •  tempMailPopUp.js
   ============================================================ */

(function (global) {
  "use strict";

  // العناصر التي تُحذف بالكامل من جسم الرسالة
  var DROP_TAGS = [
    "script", "noscript", "iframe", "frame", "frameset", "object", "embed",
    "applet", "form", "input", "button", "select", "textarea", "option",
    "link", "meta", "base", "svg", "math", "audio", "video", "source",
    "track", "canvas", "template", "portal", "dialog"
  ].join(",");

  var EVENT_ATTR = /^on/i;
  var BAD_ATTR = ["srcdoc", "formaction", "ping", "http-equiv", "xlink:href", "srcset"];

  /* ---------------- أدوات عامة ---------------- */

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // يسمح فقط بالروابط http(s) و mailto/tel وصور data الآمنة
  function safeUrl(value, allowDataImage) {
    var v = String(value == null ? "" : value).trim();
    if (!v) return null;
    if (v === "#" || /^mailto:/i.test(v) || /^tel:/i.test(v)) return v;
    if (/^data:/i.test(v)) {
      return allowDataImage && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(v) ? v : null;
    }
    try {
      var u = new URL(v);               // روابط نسبية تُرفض (لا معنى لها في الرسالة)
      return (u.protocol === "https:" || u.protocol === "http:") ? u.href : null;
    } catch (e) {
      return null;
    }
  }

  // تنظيف أنماط inline: لا javascript: ولا expression() ولا تثبيت موضعي
  function cleanInlineStyle(value) {
    var v = String(value == null ? "" : value);
    if (!v) return null;
    v = v.replace(/expression\s*\(/gi, "")
         .replace(/javascript\s*:/gi, "")
         .replace(/vbscript\s*:/gi, "")
         .replace(/behavior\s*:/gi, "")
         .replace(/-moz-binding/gi, "")
         .replace(/@import/gi, "")
         .replace(/position\s*:\s*(fixed|sticky)/gi, "position:static");
    return v.trim() || null;
  }

  /* ---------------- التعقيم ---------------- */

  function sanitizeHtml(html, opts) {
    opts = opts || {};
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");

    doc.querySelectorAll(DROP_TAGS).forEach(function (n) { n.remove(); });

    // أنماط <style> محصورة داخل الإطار المعزول — تُبقى لأن الرسائل تعتمد عليها،
    // ويُحذف منها أي @import (تحميل خارجي) لأنها تُستخدم للتتبّع
    doc.querySelectorAll("style").forEach(function (n) {
      if (!opts.keepStyles) { n.remove(); return; }
      n.textContent = String(n.textContent || "")
        .replace(/@import[^;]*;?/gi, "")
        .replace(/expression\s*\(/gi, "")
        .replace(/position\s*:\s*(fixed|sticky)/gi, "position:static");
    });

    doc.body.querySelectorAll("*").forEach(function (el) {
      var tag = el.tagName.toLowerCase();

      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();

        if (EVENT_ATTR.test(name) || BAD_ATTR.indexOf(name) !== -1) {
          el.removeAttribute(attr.name);
          return;
        }

        if (name === "style") {
          var cleaned = cleanInlineStyle(attr.value);
          if (cleaned) el.setAttribute("style", cleaned); else el.removeAttribute("style");
          return;
        }

        if (name === "href") {
          var original = String(attr.value || "");      // يُقرأ قبل التعديل (Attr حيّ)
          var safe = safeUrl(original, false);
          if (safe) {
            el.setAttribute("href", safe);
          } else {
            el.setAttribute("href", "#");
            el.setAttribute("data-blocked", original.slice(0, 80));
          }
          if (tag === "a") {
            el.setAttribute("target", "_blank");
            el.setAttribute("rel", "noopener noreferrer nofollow");
          }
          return;
        }

        if (name === "src" || name === "background" || name === "poster") {
          var u = safeUrl(String(attr.value || ""), name === "src" && tag === "img");
          if (u && !(!opts.images && /^https?:/i.test(u))) {
            el.setAttribute(name, u);
          } else {
            el.removeAttribute(attr.name);
          }
        }
      });
    });

    // سياسة الصور: مخفية افتراضياً (تمنع بيكسلات التتبّع وتسرّع العرض)
    doc.body.querySelectorAll("img").forEach(function (img) {
      if (opts.images) {
        img.setAttribute("loading", "lazy");
        img.setAttribute("referrerpolicy", "no-referrer");
        return;
      }
      var ph = doc.createElement("span");
      ph.className = "nb-mv-imgph";
      ph.textContent = (img.getAttribute("alt") || "🖼 صورة مخفية").slice(0, 120);
      img.replaceWith(ph);
    });

    return doc.body.innerHTML;
  }

  /* ---------------- بناء مستند الإطار ---------------- */

  var DOC_CSS = [
    "html,body{margin:0;padding:0;background:#ffffff;color:#111827;}",
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;",
    "font-size:13px;line-height:1.7;padding:10px 12px;word-wrap:break-word;overflow-wrap:break-word;}",
    "table{max-width:100%!important;}",
    "img{max-width:100%!important;height:auto!important;border:0;}",
    "a{color:#0369a1;text-decoration:underline;}",
    "pre,code{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;}",
    ".nb-mv-plain{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;",
    "font-size:12px;margin:0;color:#111827;}",
    ".nb-mv-imgph{display:inline-block;background:#f1f5f9;border:1px dashed #94a3b8;border-radius:6px;",
    "padding:2px 7px;color:#64748b;font-size:11px;}",
    "blockquote{margin:8px 0;padding-right:8px;border-right:3px solid #cbd5e1;color:#475569;}"
  ].join("");

  function buildDocument(innerHtml) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
      'img-src https: data:; style-src \'unsafe-inline\'; font-src data:;">' +
      "<style>" + DOC_CSS + "</style></head>" +
      '<body dir="auto" class="nb-mv-doc">' + innerHtml + "</body></html>";
  }

  /* ---------------- مساعدات العرض ---------------- */

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("ar-EG", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function formatSize(bytes) {
    var n = Number(bytes || 0);
    if (!n) return "";
    if (n < 1024) return n + " بايت";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " ك.ب";
    return (n / 1024 / 1024).toFixed(1) + " م.ب";
  }

  function copy(text) {
    if (!text) return Promise.resolve(false);
    try {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return false; });
    } catch (e) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        return Promise.resolve(true);
      } catch (e2) { return Promise.resolve(false); }
    }
  }

  function shorten(url, max) {
    var u = String(url || "");
    if (u.length <= max) return u;
    var head = Math.ceil((max - 1) * 0.65);
    return u.slice(0, head) + "…" + u.slice(-(max - head - 1));
  }

  /* ============================================================
     createView(full, opts)  →  عنصر جاهز لإدراجه تحت صف الرسالة
     full: {subject, from, to, createdAt, html, text, links, code, attachments, id}
     opts: {height, expandedHeight, onStatus(msg), onOpen(url), onDelete(full), onCopied(text)}
     ============================================================ */

  function createView(full, opts) {
    opts = opts || {};
    full = full || {};

    var onStatus = opts.onStatus || function () {};
    var onOpen = opts.onOpen || function (u) {
      try { window.open(u, "_blank", "noopener,noreferrer"); } catch (e) {}
    };
    var baseH = opts.height || 300;
    var bigH = opts.expandedHeight || (baseH + 240);

    var links = (Array.isArray(full.links) ? full.links : []).filter(Boolean);
    var code = full.code || null;
    var hasHtml = !!(full.html && String(full.html).trim());
    var hasText = !!(full.text && String(full.text).trim());
    var mode = hasHtml ? "html" : "text";
    var showImages = false;
    var expanded = false;
    var frame = null;
    var inlineHolder = null;

    var root = el("div", "nb-mv-view");

    /* --- ترويسة الرسالة --- */
    var head = el("div", "nb-mv-head");
    var subject = el("div", "nb-mv-subject", full.subject || "(بدون موضوع)");
    subject.setAttribute("dir", "auto");
    var fromName = full.from && (full.from.name || full.from.address)
      ? String(full.from.name || full.from.address) : "";
    var meta = el("div", "nb-mv-meta",
      [fromName, formatDate(full.createdAt)].filter(Boolean).join("  •  "));
    meta.setAttribute("dir", "auto");
    meta.title = fromName;
    head.appendChild(subject);
    head.appendChild(meta);
    root.appendChild(head);

    /* --- كود التحقق (OTP) --- */
    if (code) {
      var otpWrap = el("div", "nb-mv-otp-wrap");
      var otpLabel = el("div", "nb-mv-label", "كود التحقق — انقر للنسخ");
      var otp = el("div", "nb-mv-otp", code);
      otp.title = "انقر لنسخ كود التحقق";
      otp.onclick = function (e) {
        e.stopPropagation();
        copy(code).then(function () { onStatus("✓ تم نسخ الكود: " + code); });
      };
      otpWrap.appendChild(otpLabel);
      otpWrap.appendChild(otp);
      root.appendChild(otpWrap);
    }

    /* --- شريط الأدوات --- */
    var tools = el("div", "nb-mv-tools");

    function toolButton(label, title, onClick) {
      var b = el("button", "nb-mv-btn", label);
      b.type = "button";
      if (title) b.title = title;
      b.onclick = function (e) { e.stopPropagation(); onClick(b); };
      return b;
    }

    if (hasHtml && hasText) {
      var seg = el("div", "nb-mv-seg");
      var bHtml = toolButton("HTML", "عرض الرسالة بتنسيقها الأصلي", function () { setMode("html"); });
      var bText = toolButton("نص", "عرض الرسالة كنص مجرّد", function () { setMode("text"); });
      seg.appendChild(bHtml);
      seg.appendChild(bText);
      tools.appendChild(seg);
      tools._html = bHtml;
      tools._text = bText;
    }

    if (hasHtml) {
      var bImg = toolButton("🖼 الصور", "إظهار صور الرسالة (قد تُستخدم للتتبّع)", function (b) {
        showImages = !showImages;
        b.classList.toggle("active", showImages);
        renderContent();
        onStatus(showImages ? "تم تحميل صور الرسالة" : "تم إخفاء الصور");
      });
      tools.appendChild(bImg);
    }

    var bSize = toolButton("⤢ توسيع", "تكبير مساحة عرض الرسالة", function () {
      expanded = !expanded;
      applyHeight();
    });
    tools.appendChild(bSize);

    tools.appendChild(toolButton("📋 نسخ النص", "نسخ نص الرسالة كاملاً", function () {
      copy(full.text || stripTags(full.html)).then(function () { onStatus("✓ تم نسخ نص الرسالة"); });
    }));

    if (opts.onDelete) {
      tools.appendChild(toolButton("🗑 حذف", "حذف هذه الرسالة من الصندوق", function (b) {
        b.disabled = true;
        opts.onDelete(full).then(function () { onStatus("تم حذف الرسالة"); },
          function (e) { b.disabled = false; onStatus("خطأ في الحذف: " + (e && e.message)); });
      }));
    }

    root.appendChild(tools);

    /* --- جسم الرسالة (iframe معزول + بديل عند منع الإطارات) --- */
    var bodyWrap = el("div", "nb-mv-body");

    function renderContent() {
      var inner;
      if (mode === "text" || !hasHtml) {
        inner = '<pre class="nb-mv-plain">' + escapeHtml(full.text || stripTags(full.html)) + "</pre>";
      } else {
        inner = sanitizeHtml(full.html, { images: showImages, keepStyles: true });
        if (!String(inner).trim()) {
          inner = '<pre class="nb-mv-plain">' + escapeHtml(full.text || "") + "</pre>";
        }
      }
      var docHtml = buildDocument(inner);

      if (inlineHolder) {                       // سبق أن مُنع الإطار → نحدّث المحتوى مباشرة
        inlineHolder.innerHTML = sanitizeHtml(inner, { images: showImages, keepStyles: true });
        return;
      }

      if (!frame) {
        frame = document.createElement("iframe");
        frame.className = "nb-mv-frame";
        frame.title = "محتوى الرسالة";
        // allow-same-origin للسماح بضبط الارتفاع تلقائياً — وبدون allow-scripts
        // فلا يمكن لأي سكربت داخل الرسالة العمل (إضافةً إلى التعقيم المسبق)
        frame.setAttribute("sandbox", "allow-same-origin allow-popups allow-popups-to-escape-sandbox");
        frame.setAttribute("referrerpolicy", "no-referrer");
        frame.setAttribute("scrolling", "yes");
        frame.style.height = baseH + "px";
        bodyWrap.appendChild(frame);
        guardFrame();
      }
      frame.srcdoc = docHtml;                   // المحتوى كاملاً — بدون أي اقتطاع
      if (showImages) setTimeout(fitHeight, 900);
    }

    // ضبط الارتفاع تلقائياً حسب محتوى الرسالة (بحد أقصى يزداد مع «توسيع»)
    function fitHeight() {
      if (!frame) return;
      var h = 0;
      try {
        var d = frame.contentDocument;
        if (d && d.documentElement) h = d.documentElement.scrollHeight || 0;
      } catch (e) { h = 0; }
      if (!h) return;
      var cap = expanded ? Math.max(bigH, 520) : baseH;
      frame.style.height = Math.min(Math.max(h + 18, 180), cap) + "px";
    }

    // إن كان الموقع يمنع الإطارات (CSP صارم) نعرض المحتوى المعقّم مباشرة
    function guardFrame() {
      var loaded = false;
      frame.addEventListener("load", function () { loaded = true; fitHeight(); });
      setTimeout(function () {
        if (!frame || !frame.parentNode) return;
        try {
          var d = frame.contentDocument;
          if (d && d.body && d.body.childNodes.length) return;   // عُرض فعلاً
        } catch (e) { return; }                                   // وصول مرفوض = يعمل
        frame.remove();
        frame = null;
        inlineHolder = el("div", "nb-mv-inline");
        inlineHolder.setAttribute("dir", "auto");
        inlineHolder.style.maxHeight = (expanded ? bigH : baseH) + "px";
        bodyWrap.appendChild(inlineHolder);
        renderContent();
      }, 1500);
    }

    function applyHeight() {
      var h = expanded ? bigH : baseH;
      if (frame) frame.style.height = h + "px";
      if (inlineHolder) inlineHolder.style.maxHeight = h + "px";
      setTimeout(fitHeight, 60);
    }

    function setMode(next) {
      mode = next;
      if (tools._html) tools._html.classList.toggle("active", mode === "html");
      if (tools._text) tools._text.classList.toggle("active", mode === "text");
      renderContent();
    }

    root.appendChild(bodyWrap);

    /* --- الروابط --- */
    if (links.length) {
      var lb = el("div", "nb-mv-links");
      lb.appendChild(el("div", "nb-mv-label", "الروابط (" + links.length + ")"));
      links.slice(0, 12).forEach(function (u) {
        var rowL = el("div", "nb-mv-linkrow");
        var a = el("a", "nb-mv-link", shorten(u, 70));
        a.href = u;
        a.title = u;
        a.setAttribute("dir", "ltr");
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.onclick = function (e) { e.stopPropagation(); };

        var copyBtn = toolButton("نسخ", "نسخ الرابط", function () {
          copy(u).then(function () { onStatus("✓ تم نسخ الرابط"); });
        });
        var openBtn = toolButton("فتح ↗", "فتح الرابط في تبويب جديد", function () {
          onStatus("جارٍ فتح الرابط…");
          onOpen(u);
        });

        rowL.appendChild(a);
        rowL.appendChild(copyBtn);
        rowL.appendChild(openBtn);
        lb.appendChild(rowL);
      });
      root.appendChild(lb);
    }

    /* --- المرفقات --- */
    var atts = Array.isArray(full.attachments) ? full.attachments : [];
    if (atts.length) {
      var ab = el("div", "nb-mv-attach");
      ab.appendChild(el("div", "nb-mv-label", "المرفقات (" + atts.length + ")"));
      atts.forEach(function (att) {
        var r = el("div", "nb-mv-attrow");
        var name = el("span", "nb-mv-attname", att.filename || att.name || "مرفق");
        name.setAttribute("dir", "auto");
        r.appendChild(name);
        if (att.size) r.appendChild(el("span", "nb-mv-attsize", formatSize(att.size)));
        var url = att.downloadUrl || att.url || null;
        if (url) {
          r.appendChild(toolButton("تنزيل", att.filename || "تنزيل المرفق", function () {
            onOpen(url);
          }));
        }
        ab.appendChild(r);
      });
      root.appendChild(ab);
    }

    if (!hasHtml && !hasText && !links.length) {
      root.appendChild(el("div", "nb-mv-empty", "هذه الرسالة لا تحتوي محتوى نصياً يمكن عرضه."));
    }

    setMode(mode);
    applyHeight();
    return root;
  }

  function stripTags(html) {
    if (!html) return "";
    var d = new DOMParser().parseFromString(String(html), "text/html");
    return (d.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  global.NabihMail = {
    escapeHtml: escapeHtml,
    sanitizeHtml: sanitizeHtml,
    createView: createView,
    stripTags: stripTags,
    copy: copy,
    formatDate: formatDate
  };
})(typeof window !== "undefined" ? window : self);
