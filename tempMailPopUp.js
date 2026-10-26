// نافذة اختبار البريد المؤقت — تستخدم نفس عارض الرسائل الآمن (mailRender.js)
// ملاحظة: كان هذا الملف يتعامل مع ناتج inbox كمصفوفة بينما يرجع
// {items,total} — فتظهر القائمة فارغة أو خطأ. تم التصحيح.

document.addEventListener("DOMContentLoaded", async () => {
    const $ = id => document.getElementById(id);
    const status = (msg, ok) => {
        const el = $("status");
        if (!el) return;
        el.textContent = msg || "";
        el.style.color = ok === false ? "#f87171" : "#34d399";
    };

    async function call(type, payload = {}) {
        const res = await chrome.runtime.sendMessage({ type, ...payload });
        if (!res?.ok) throw new Error(res?.error || "لا استجابة من الخلفية");
        return res.data;
    }

    $("new").onclick = async () => {
        try {
            status("جاري الإنشاء…");
            const { address, domain } = await call("create");
            $("addr").textContent = address;
            if ($("domain")) $("domain").textContent = domain || address.split("@")[1];
            $("count").textContent = "0";
            $("unread").textContent = "0";
            if ($("list")) $("list").innerHTML = "";
            status("تم الإنشاء");
        } catch (e) {
            status("خطأ: " + e.message, false);
        }
    };

    $("inbox").onclick = async () => {
        try {
            status("جاري التحديث…");
            const list = await call("inbox");
            const items = Array.isArray(list) ? list : (list.items || []);
            const total = (list && list.total) ? list.total : items.length;

            $("count").textContent = String(items.length);
            $("unread").textContent = String(items.filter(m => !m.seen).length);
            $("list").innerHTML = items.length ? "" : "<div>الصندوق فارغ</div>";

            items.forEach(m => {
                const row = document.createElement("div");
                row.className = "nabih-sidebar-card nabih-card-email";
                row.style.cursor = "pointer";

                const title = document.createElement("strong");
                title.dir = "auto";
                title.textContent = m.subject || "(بدون موضوع)";

                const intro = document.createElement("p");
                intro.dir = "auto";
                intro.textContent = (m.intro || "").trim();

                const meta = document.createElement("small");
                meta.dir = "auto";
                meta.textContent = [m.from?.address || "", m.hasAttachments ? "📎" : ""]
                    .filter(Boolean).join("  •  ");

                row.appendChild(title);
                if (intro.textContent) row.appendChild(intro);
                row.appendChild(meta);

                let cache = null;
                let autoOpened = false;

                row.onclick = async (ev) => {
                    if (ev.target.closest && ev.target.closest(".nb-mv-view")) return;
                    try {
                        // نقر ثانٍ يطوي الرسالة
                        if (row.querySelector(".nb-mv-view")) {
                            row.querySelector(".nb-mv-view").remove();
                            status("");
                            return;
                        }
                        if (!cache) { status("جاري القراءة…"); cache = await call("read", { id: m.id }); }
                        const full = cache;

                        const Renderer = window.NabihMail;
                        if (Renderer) {
                            const view = Renderer.createView(full, {
                                height: 260,
                                expandedHeight: 460,
                                onStatus: (t) => status(t),
                                onOpen: (u) => { try { window.open(u, "_blank", "noopener,noreferrer"); } catch (e) {} },
                                onDelete: async (msg) => {
                                    await call("remove", { id: msg.id });
                                    row.remove();
                                    status("تم حذف الرسالة");
                                }
                            });
                            row.appendChild(view);
                        }

                        const links = Array.isArray(full.links) ? full.links : [];
                        const code = full.code || null;
                        const toCopy = code || links[0] || full.text || "";
                        if (toCopy) await navigator.clipboard.writeText(toCopy).catch(() => {});
                        if (code) status(`✓ تم نسخ الكود: ${code}`);
                        else if (links[0]) status("✓ تم نسخ الرابط");
                        else status("✓ تم نسخ النص");

                        if (!code && links.length && !autoOpened) {
                            autoOpened = true;
                            try { window.open(links[0], "_blank", "noopener,noreferrer"); } catch (e) {}
                        }
                    } catch (e) {
                        status("خطأ: " + e.message, false);
                    }
                };
                $("list").appendChild(row);
            });

            status(items.length < total ? `عُرض ${items.length} من ${total}` : "تم التحديث");
        } catch (e) {
            status("خطأ: " + e.message, false);
        }
    };

    // استعادة الجلسة عند الفتح
    const stored = await chrome.storage.local.get(["nabihTempMail", "address"]);
    const addr = stored.nabihTempMail || stored.address;
    if (addr) {
        $("addr").textContent = addr;
        if ($("domain")) $("domain").textContent = addr.split("@")[1];
        if ($("inbox")) $("inbox").click();
    }
});
