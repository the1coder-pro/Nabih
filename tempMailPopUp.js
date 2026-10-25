document.addEventListener("DOMContentLoaded", async () => {
    const $ = id => document.getElementById(id);
    const status = msg => { $("status").textContent = msg; };

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
            $("domain").textContent = domain || address.split("@")[1];
            $("count").textContent = "0";
            $("unread").textContent = "0";
            status("تم الإنشاء");
        } catch (e) {
            status("خطأ: " + e.message);
        }
    };

    $("inbox").onclick = async () => {
        try {
            status("جاري التحديث…");
            const list = await call("inbox");
            $("count").textContent = list.length;
            $("unread").textContent = list.filter(m => !m.seen).length;
            $("list").innerHTML = list.length ? "" : "<div>الصندوق فارغ</div>";
            list.forEach(m => {
                const row = document.createElement("div");
                row.className = "nabih-sidebar-card nabih-card-email";
                row.style.cursor = "pointer";
                row.innerHTML = `<strong>${m.subject || "(بدون موضوع)"}</strong>
          <p>${m.intro || ""}<br><small>${m.from?.address || ""}</small></p>`;
                row.onclick = () => chrome.runtime.sendMessage({ type: "read", id: m.id })
                    .then(r => r.ok && navigator.clipboard.writeText(r.data.text || ""));
                $("list").appendChild(row);
            });
            status("تم التحديث");
        } catch (e) {
            status("خطأ: " + e.message);
        }
    };

    // restore session on open
    const stored = await chrome.storage.local.get("address");
    if (stored.address) {
        $("addr").textContent = stored.address;
        $("domain").textContent = stored.address.split("@")[1];
        $("inbox").click();
    }
});