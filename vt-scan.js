// Browser (extension page) version of the VirusTotal URL scanner.
const api = typeof browser !== "undefined" && browser.runtime ? browser : (typeof chrome !== "undefined" ? chrome : {});
const API_BASE = "https://www.virustotal.com/api/v3";
const API_KEY = "53fb04d0231ebd495aeb9a34c33d43c266b410472a158952bf347f5fd887eb4e"; // demo only
const POLL_INTERVAL_MS = 15_000; // free tier allows 4 requests/min
const MAX_ATTEMPTS = 10;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setState(state, title, sub = "") {
  $("vt-state").hidden = false;
  $("vt-state").dataset.state = state;
  $("vt-title").textContent = title;
  $("vt-sub").textContent = sub;
}

function validateUrl(input) {
  let parsed;
  try { parsed = new URL(input); } catch { throw new Error("الرابط غير صالح."); }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("يُدعم فقط فحص روابط http:// و https://");
  }
  return parsed.href;
}

async function vtRequest(apiKey, path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { accept: "application/json", "x-apikey": apiKey, ...options.headers },
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("تجاوزت حد الطلبات. انتظر دقيقة ثم أعد المحاولة.");
    if (res.status === 401) throw new Error("مفتاح API غير صالح.");
    throw new Error(`خطأ من VirusTotal (${res.status}).`);
  }
  return res.json();
}

async function submitUrl(apiKey, url) {
  const json = await vtRequest(apiKey, "/urls", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ url }),
  });
  return json.data.id;
}

async function getAnalysis(apiKey, id) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const json = await vtRequest(apiKey, `/analyses/${id}`);
    if (json.data.attributes.status === "completed") return json;
    setState("loading", "جارٍ تحليل الرابط…", `المحاولة ${attempt} من ${MAX_ATTEMPTS}`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("انتهت المهلة قبل اكتمال التحليل. أعد المحاولة لاحقًا.");
}

const VERDICTS = {
  clean:      ["آمن", "لم يُبلغ أي محرك فحص عن هذا الرابط."],
  suspicious: ["مشبوه", "أبلغ بعض المحركات عن الرابط كمشبوه. تعامل معه بحذر."],
  malicious:  ["خبيث", "أبلغت محركات فحص عن الرابط كخبيث. لا تُدخل أي بيانات فيه."],
};

let currentUrl = "";

function saveScanReport(url, json) {
  try {
    const { stats, results } = json.data.attributes;
    const key = stats.malicious > 0 ? "malicious" : stats.suspicious > 0 ? "suspicious" : "clean";
    const urlId = json.meta?.url_info?.id;
    let hostname = "";
    try { hostname = new URL(url).hostname; } catch { hostname = url; }

    const report = {
      id: "scan_" + Date.now(),
      url: url,
      domain: hostname,
      timestamp: Date.now(),
      verdict: key,
      verdictText: VERDICTS[key][0],
      stats: {
        malicious: stats.malicious || 0,
        suspicious: stats.suspicious || 0,
        harmless: stats.harmless || 0,
        undetected: stats.undetected || 0,
      },
      vtUrl: urlId ? `https://www.virustotal.com/gui/url/${urlId}` : null,
      rawJson: json
    };

    if (api.storage?.local) {
      api.storage.local.get(["nabihScanReports"], (res) => {
        const list = Array.isArray(res?.nabihScanReports) ? res.nabihScanReports : [];
        const updated = [report, ...list.filter(item => item.url !== url)].slice(0, 30);
        api.storage.local.set({ nabihScanReports: updated });
      });
    }
  } catch (err) {
    console.warn("[Nabih] Could not save scan report:", err);
  }
}

function render(json) {
  const { stats, results } = json.data.attributes;
  const key = stats.malicious > 0 ? "malicious" : stats.suspicious > 0 ? "suspicious" : "clean";

  $("vt-state").hidden = true;
  $("vt-result").hidden = false;
  $("vt-verdict").dataset.verdict = key;
  $("vt-verdict-text").textContent = VERDICTS[key][0];
  $("vt-verdict-desc").textContent = VERDICTS[key][1];
  for (const k of ["malicious", "suspicious", "harmless", "undetected"]) {
    $(`s-${k}`).textContent = stats[k] ?? 0;
  }

  const flagged = Object.values(results || {}).filter(
    (r) => r.category === "malicious" || r.category === "suspicious"
  );
  if (flagged.length) {
    $("vt-flagged-box").hidden = false;
    const ul = $("vt-flagged");
    ul.replaceChildren(...flagged.map((r) => {
      const li = document.createElement("li");
      li.textContent = `${r.engine_name}: ${r.result} (${r.category})`;
      return li;
    }));
  } else {
    $("vt-flagged-box").hidden = true;
  }

  const urlId = json.meta?.url_info?.id;
  if (urlId) {
    const a = $("vt-report");
    a.href = `https://www.virustotal.com/gui/url/${urlId}`;
    a.hidden = false;
  }

  const rescanBtn = $("vt-rescan");
  if (rescanBtn) rescanBtn.hidden = false;

  if (currentUrl) {
    saveScanReport(currentUrl, json);
  }
}

async function scan(apiKey, url) {
  try {
    $("vt-result").hidden = true;
    setState("loading", "جارٍ إرسال الرابط…");
    const id = await submitUrl(apiKey, url);
    setState("loading", "جارٍ تحليل الرابط…");
    render(await getAnalysis(apiKey, id));
  } catch (err) {
    setState("error", "تعذّر إكمال الفحص", err.message);
  }
}

async function main() {
  try {
    currentUrl = validateUrl(new URLSearchParams(location.search).get("url") || "");
  } catch (err) {
    return setState("error", "لا يوجد رابط للفحص", err.message);
  }
  $("vt-url").textContent = currentUrl;

  const force = new URLSearchParams(location.search).get("force") === "1";

  if (!force && api.storage?.local) {
    api.storage.local.get(["nabihScanReports"], (res) => {
      const list = res?.nabihScanReports || [];
      const cached = list.find(r => r.url === currentUrl);
      if (cached && cached.rawJson && (Date.now() - (cached.timestamp || 0) < 1800000)) {
        render(cached.rawJson);
        return;
      }
      scan(API_KEY, currentUrl);
    });
  } else {
    scan(API_KEY, currentUrl);
  }
}

$("vt-back").addEventListener("click", () => { location.href = "popup.html"; });

const rescanBtn = $("vt-rescan");
if (rescanBtn) {
  rescanBtn.addEventListener("click", () => {
    scan(API_KEY, currentUrl);
  });
}

main();