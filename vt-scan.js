

const API_BASE = "https://www.virustotal.com/api/v3";
const API_KEY = "53fb04d0231ebd495aeb9a34c33d43c266b410472a158952bf347f5fd887eb4e";

const POLL_INTERVAL_MS = 15_000; 
const MAX_ATTEMPTS = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function validateUrl(input) {
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Invalid URL: "${input}"`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  return parsed.href;
}

async function vtRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      "x-apikey": API_KEY,
      ...options.headers,
    },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = err?.error?.message ? ` - ${err.error.message}` : "";
    } catch {}
    if (res.status === 429) throw new Error("Rate limit exceeded. Wait a minute and retry.");
    if (res.status === 401) throw new Error("Invalid or missing API key.");
    throw new Error(`VirusTotal API error ${res.status}${detail}`);
  }
  return res.json();
}

// Step 1: submit the URL for analysis
async function submitUrl(url) {
  const body = new URLSearchParams({ url });
  const json = await vtRequest("/urls", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return json.data.id; // analysis ID
}

// Step 2: poll until the analysis completes
async function getAnalysis(analysisId) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const json = await vtRequest(`/analyses/${analysisId}`);
    const { status } = json.data.attributes;

    if (status === "completed") return json.data.attributes;

    console.log(`Status: ${status} (attempt ${attempt}/${MAX_ATTEMPTS}), waiting...`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Timed out waiting for analysis to complete.");
}

function summarize(attrs) {
  const { stats, results } = attrs;
  const flagged = Object.values(results).filter(
    (r) => r.category === "malicious" || r.category === "suspicious"
  );

  let verdict = "CLEAN";
  if (stats.malicious > 0) verdict = "MALICIOUS";
  else if (stats.suspicious > 0) verdict = "SUSPICIOUS";

  return {
    verdict,
    stats,
    flaggedBy: flagged.map((r) => `${r.engine_name}: ${r.result} (${r.category})`),
  };
}

async function main() {
  if (!API_KEY) {
    console.error("Set your API key first: export VT_API_KEY=your_key");
    process.exit(1);
  }

  const input = process.argv[2];
  if (!input) {
    console.error("Usage: node vt-scan.mjs <url>");
    process.exit(1);
  }

  const url = validateUrl(input);
  console.log(`Submitting: ${url}`);

  const analysisId = await submitUrl(url);
  const attrs = await getAnalysis(analysisId);
  const { verdict, stats, flaggedBy } = summarize(attrs);

  console.log("\n=== VirusTotal Result ===");
  console.log(`Verdict:    ${verdict}`);
  console.log(`Malicious:  ${stats.malicious}`);
  console.log(`Suspicious: ${stats.suspicious}`);
  console.log(`Harmless:   ${stats.harmless}`);
  console.log(`Undetected: ${stats.undetected}`);

  if (flaggedBy.length) {
    console.log("\nFlagged by:");
    flaggedBy.forEach((line) => console.log(` - ${line}`));
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
