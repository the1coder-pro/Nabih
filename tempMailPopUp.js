document.addEventListener("DOMContentLoaded", async () => {
    const api = typeof browser !== "undefined" && browser.runtime ? browser : (typeof chrome !== "undefined" ? chrome : {});
    const $ = id => document.getElementById(id);
    const status = msg => { if ($("status")) $("status").textContent = msg; };

    async function copySafely(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch {}
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            return true;
        } catch {
            return false;
        }
    }

    async function call(type, payload = {}) {
        if (!api.runtime?.sendMessage) throw new Error("بيئة الإضافة غير متوفرة");
        const res = await api.runtime.sendMessage({ type, ...payload });
        if (!res?.ok) throw new Error(res?.error || "لا استجابة من الخلفية");
        return res.data;
    }

    if ($("new")) {
        $("new").onclick = async () => {
            try {
                status("جاري الإنشاء…");
                const { address, domain } = await call("create");
                if ($("addr")) $("addr").textContent = address;
                if ($("domain")) $("domain").textContent = domain || address.split("@")[1];
                if ($("count")) $("count").textContent = "0";
                if ($("unread")) $("unread").textContent = "0";
                status("تم الإنشاء");
            } catch (e) {
                status("خطأ: " + e.message);
            }
        };
    }

    if ($("inbox")) {
        $("inbox").onclick = async () => {
            try {
                status("جاري التحديث…");
                const res = await call("inbox");
                const list = Array.isArray(res) ? res : (res?.items || []);
                const total = res?.total || list.length;
                if ($("count")) $("count").textContent = total;
                if ($("unread")) $("unread").textContent = list.filter(m => !m.seen).length;
                if ($("list")) {
                    $("list").innerHTML = list.length ? "" : "<div>الصندوق فارغ</div>";
                    list.forEach(m => {
                        const row = document.createElement("div");
                        row.className = "nabih-sidebar-card nabih-card-email";
                        row.style.cursor = "pointer";
                        row.innerHTML = `<strong>${m.subject || "(بدون موضوع)"}</strong>
                  <p>${m.intro || ""}<br><small>${m.from?.address || ""}</small></p>`;
                        row.onclick = async () => {
                            try {
                                const r = await api.runtime.sendMessage({ type: "read", id: m.id });
                                if (r?.ok && r.data?.text) {
                                    await copySafely(r.data.text);
                                }
                            } catch {}
                        };
                        $("list").appendChild(row);
                    });
                }
                status("تم التحديث");
            } catch (e) {
                status("خطأ: " + e.message);
            }
        };
    }

    // استعادة الجلسة عند الفتح
    api.storage?.local?.get("address", (stored) => {
        if (stored?.address) {
            if ($("addr")) $("addr").textContent = stored.address;
            if ($("domain")) $("domain").textContent = stored.address.split("@")[1];
            if ($("inbox")) $("inbox").click();
        }
    });
});
