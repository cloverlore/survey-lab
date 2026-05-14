const $ = (id) => document.getElementById(id);

function makeCollapsible(sectionId) {
  const section = $(sectionId);
  if (section.classList.contains("collapsible")) return;
  section.classList.add("collapsible");
  section.querySelector("h2").addEventListener("click", () =>
    section.classList.toggle("collapsed")
  );
}

function collapseSection(sectionId) {
  $(sectionId).classList.add("collapsed");
}

const state = {
  fileName: null,
  rows: [],
  columns: [],
  columnTypes: {},
  presets: [],
  ratingColumns: [],
  cleaning: {},
};

fetch("presets.json")
  .then((r) => r.json())
  .then((data) => { state.presets = data.presets; })
  .catch((err) => console.error("Failed to load presets:", err));

$("csv-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.fileName = file.name;
  state.cleaning = {};
  state.ratingColumns = [];
  $("cleaning-section").hidden = true;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      state.rows = results.data;
      state.columns = results.meta.fields || [];
      state.columnTypes = Object.fromEntries(state.columns.map((c) => [c, "ignore"]));
      renderPreview();
      renderColumnControls();
    },
    error: (err) => alert("Could not parse CSV: " + err.message),
  });
});

function renderPreview() {
  $("preview-meta").textContent =
    `${state.fileName} — ${state.rows.length} rows, ${state.columns.length} columns. Showing first 20.`;
  const rows = state.rows.slice(0, 20);
  const html = [
    "<table><thead><tr>",
    ...state.columns.map((c) => `<th>${escapeHtml(c)}</th>`),
    "</tr></thead><tbody>",
    ...rows.map(
      (r) => "<tr>" + state.columns.map((c) => `<td>${escapeHtml(r[c] ?? "")}</td>`).join("") + "</tr>"
    ),
    "</tbody></table>",
  ].join("");
  $("preview-table").innerHTML = html;
  $("preview-section").hidden = false;
  makeCollapsible("preview-section");
}

function renderColumnControls() {
  const container = $("column-controls");
  container.innerHTML =
    state.columns
      .map(
        (col) => `
        <div class="col-row">
          <label>${escapeHtml(col)}</label>
          <select data-col="${escapeHtml(col)}">
            <option value="ignore">Ignore</option>
            <option value="rating">Rating</option>
            <option value="categorical">Categorical</option>
            <option value="id">Respondent ID</option>
          </select>
        </div>`
      )
      .join("") +
    `<div class="actions">
       <button id="confirm-columns">Continue to cleaning →</button>
     </div>`;

  container.querySelectorAll("select").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      state.columnTypes[e.target.dataset.col] = e.target.value;
    });
  });

  $("confirm-columns").addEventListener("click", onConfirmColumns);
  $("columns-section").hidden = false;
  makeCollapsible("columns-section");
}

function onConfirmColumns() {
  if (state.presets.length === 0) {
    alert("Presets are still loading. Try again in a moment.");
    return;
  }
  state.ratingColumns = state.columns.filter((c) => state.columnTypes[c] === "rating");
  if (state.ratingColumns.length === 0) {
    alert("Mark at least one column as Rating before continuing.");
    return;
  }
  for (const col of state.ratingColumns) {
    if (!state.cleaning[col]) {
      state.cleaning[col] = buildCleaningState(col);
      autoMapColumn(col);
    }
  }
  renderCleaning();
}

function buildCleaningState(col) {
  const counts = new Map();
  let missing = 0;
  for (const row of state.rows) {
    const v = row[col];
    if (v == null || String(v).trim() === "") {
      missing++;
      continue;
    }
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const uniqueValues = [...counts.keys()].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })
  );
  return {
    presetId: state.presets[0].id,
    uniqueValues,
    uniqueCounts: uniqueValues.map((v) => counts.get(v)),
    missing,
    mappings: {},
  };
}

function getPreset(id) {
  return state.presets.find((p) => p.id === id);
}

function autoMapColumn(col) {
  const c = state.cleaning[col];
  const preset = getPreset(c.presetId);
  c.mappings = {};
  for (const raw of c.uniqueValues) {
    const mapped = matchValue(raw, preset);
    if (mapped != null) c.mappings[raw] = mapped;
  }
}

function matchValue(raw, preset) {
  if (raw == null) return null;
  const norm = String(raw).toLowerCase().trim().replace(/\s+/g, " ");
  if (norm === "") return null;

  if (/^\d+$/.test(norm)) {
    const n = Number(norm);
    if (n >= 1 && n <= preset.scale) return n;
  }

  // Strip leading number prefix like "1- ", "1) ", "(1) ", "1. ", "1: "
  const prefixMatch = norm.match(/^[(]?(\d+)[)]?\s*[-.):,]?\s*(.+)$/);
  let prefixNum = null;
  let stripped = norm;
  if (prefixMatch) {
    prefixNum = Number(prefixMatch[1]);
    stripped = prefixMatch[2].trim();
  }

  for (const [value, labels] of Object.entries(preset.labels)) {
    if (labels.includes(stripped) || labels.includes(norm)) {
      return Number(value);
    }
  }

  if (prefixNum != null && prefixNum >= 1 && prefixNum <= preset.scale) {
    return prefixNum;
  }

  return null;
}

function renderCleaning() {
  const container = $("cleaning-controls");
  container.innerHTML = state.ratingColumns
    .map((col, idx) => renderCleaningCard(col, idx))
    .join("");
  state.ratingColumns.forEach((col, idx) => bindCleaningCard(col, idx));
  $("cleaning-section").hidden = false;
  makeCollapsible("cleaning-section");
  collapseSection("columns-section");
  renderComparison();
}

function renderCleaningCard(col, idx) {
  const c = state.cleaning[col];
  const preset = getPreset(c.presetId);
  const mappedCount = c.uniqueValues.filter((v) => c.mappings[v] != null).length;

  const presetOptions = state.presets
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === c.presetId ? "selected" : ""}>${escapeHtml(p.name)}</option>`
    )
    .join("");

  const rows = c.uniqueValues
    .map((v, i) => {
      const mapped = c.mappings[v];
      const isUnmapped = mapped == null;
      return `
        <tr class="${isUnmapped ? "unmapped" : ""}">
          <td>${escapeHtml(v)}</td>
          <td class="num">${c.uniqueCounts[i]}</td>
          <td>
            <input type="number" class="map-input" data-raw-idx="${i}"
                   min="1" max="${preset.scale}" step="1"
                   value="${mapped ?? ""}">
          </td>
        </tr>`;
    })
    .join("");

  return `
    <div class="cleaning-card" data-col-idx="${idx}">
      <div class="card-header">
        <h3>${escapeHtml(col)}</h3>
        <div class="card-controls">
          <label>Scale:
            <select class="preset-select">${presetOptions}</select>
          </label>
          <span class="map-status">${mappedCount} of ${c.uniqueValues.length} mapped</span>
        </div>
      </div>
      <table class="mapping-table">
        <thead><tr><th>Raw value</th><th>Count</th><th>Mapped to</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function bindCleaningCard(col, idx) {
  const card = document.querySelector(`.cleaning-card[data-col-idx="${idx}"]`);

  card.querySelector(".preset-select").addEventListener("change", (e) => {
    state.cleaning[col].presetId = e.target.value;
    autoMapColumn(col);
    card.outerHTML = renderCleaningCard(col, idx);
    bindCleaningCard(col, idx);
  });

  card.querySelectorAll(".map-input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.rawIdx);
      const raw = state.cleaning[col].uniqueValues[i];
      const val = e.target.value === "" ? null : Number(e.target.value);
      if (val == null) {
        delete state.cleaning[col].mappings[raw];
      } else {
        state.cleaning[col].mappings[raw] = val;
      }
      updateMapStatus(col, idx);
    });
  });
}

function updateMapStatus(col, idx) {
  const card = document.querySelector(`.cleaning-card[data-col-idx="${idx}"]`);
  if (!card) return;
  const c = state.cleaning[col];
  const mapped = c.uniqueValues.filter((v) => c.mappings[v] != null).length;
  card.querySelector(".map-status").textContent =
    `${mapped} of ${c.uniqueValues.length} mapped`;
  card.querySelectorAll("tbody tr").forEach((tr, i) => {
    const v = c.uniqueValues[i];
    tr.classList.toggle("unmapped", c.mappings[v] == null);
  });
}

function renderComparison() {
  const typeSel = $("comparison-type");
  // Bind once
  if (!typeSel.dataset.bound) {
    typeSel.addEventListener("change", renderComparisonPickers);
    $("run-analysis").addEventListener("click", onRunAnalysis);
    typeSel.dataset.bound = "1";
  }
  renderComparisonPickers();
  $("comparison-section").hidden = false;
  makeCollapsible("comparison-section");
}

function renderComparisonPickers() {
  const type = $("comparison-type").value;
  const container = $("comparison-pickers");
  const ratingCols = state.ratingColumns;
  const catCols = state.columns.filter((c) => state.columnTypes[c] === "categorical");

  const warnings = [];
  let html = "";

  if (type === "between-groups") {
    if (catCols.length === 0) {
      warnings.push("Mark at least one column as Categorical to use as the group.");
    }
    html = `
      <label class="block-label">Rating column:
        <select id="cmp-rating">${optionList(ratingCols)}</select>
      </label>
      <label class="block-label">Group column:
        <select id="cmp-group">${optionList(catCols)}</select>
      </label>
      <label class="block-label">Second group column (optional):
        <select id="cmp-group2"><option value="">(none)</option>${optionList(catCols)}</select>
      </label>
      <p class="hint">Each row is one independent respondent. Don't use this for repeated measures on the same people.</p>
    `;
  } else if (type === "pre-post" || type === "between-questions") {
    if (ratingCols.length < 2) {
      warnings.push("Mark at least two columns as Rating to use this comparison.");
    }
    const labelA = type === "pre-post" ? "Pre rating column" : "First rating column";
    const labelB = type === "pre-post" ? "Post rating column" : "Second rating column";
    html = `
      <label class="block-label">${labelA}:
        <select id="cmp-rating-a">${optionList(ratingCols)}</select>
      </label>
      <label class="block-label">${labelB}:
        <select id="cmp-rating-b">${optionList(ratingCols)}</select>
      </label>
      <p class="hint">Rows are treated as the same respondent across both columns (wide format).</p>
    `;
  } else if (type === "benchmark") {
    html = `
      <label class="block-label">Rating column:
        <select id="cmp-rating">${optionList(ratingCols)}</select>
      </label>
      <label class="block-label">Benchmark value:
        <input type="number" id="cmp-benchmark" step="0.01" value="4">
      </label>
      <p class="hint">Tests whether the sample differs from this fixed value. The t-test compares the mean; the Wilcoxon compares the median.</p>
    `;
  }

  container.innerHTML =
    html + warnings.map((w) => `<p class="warning">${escapeHtml(w)}</p>`).join("");
}

function optionList(cols) {
  if (cols.length === 0) return `<option value="">(none available)</option>`;
  return cols
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");
}

function getCleanedColumn(col) {
  const c = state.cleaning[col];
  return state.rows.map((row) => {
    const raw = row[col];
    if (raw == null || String(raw).trim() === "") return null;
    const m = c.mappings[raw];
    return m == null ? null : m;
  });
}

let pyodideRuntime = null;
let pyodideLoadingPromise = null;

async function loadPyodideRuntime() {
  if (pyodideRuntime) return pyodideRuntime;
  if (pyodideLoadingPromise) return pyodideLoadingPromise;

  pyodideLoadingPromise = (async () => {
    showLoading("Loading statistics engine… first run downloads ~30 MB, can take 20-60s.");
    try {
      if (typeof loadPyodide === "undefined") {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
          script.onload = resolve;
          script.onerror = () => reject(new Error("Could not load Pyodide from CDN."));
          document.head.appendChild(script);
        });
      }
      const py = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
      });
      showLoading("Loading numpy + scipy…");
      await py.loadPackage(["numpy", "scipy"]);
      showLoading("Loading stats module…");
      const code = await fetch("stats.py").then((r) => {
        if (!r.ok) throw new Error("Could not fetch stats.py");
        return r.text();
      });
      py.runPython(code);
      pyodideRuntime = py;
      return py;
    } finally {
      hideLoading();
    }
  })();

  try {
    return await pyodideLoadingPromise;
  } catch (err) {
    pyodideLoadingPromise = null;
    throw err;
  }
}

async function onRunAnalysis() {
  const payload = buildAnalysisPayload();
  if (!payload) return;

  const sizeCheck = checkSampleSizes(payload);
  if (sizeCheck.tooSmall.length > 0) {
    if (payload.type === "between-groups") {
      const choice = await showSmallSampleDialog(sizeCheck.tooSmall);
      if (choice === "cancel") return;
      if (choice === "exclude") {
        for (const { label } of sizeCheck.tooSmall) {
          delete payload.groups[label];
        }
        if (Object.keys(payload.groups).length < 2) {
          alert("After excluding small categories, fewer than 2 groups remain. Please adjust your selection.");
          return;
        }
      }
    } else {
      const list = sizeCheck.tooSmall.map((s) => `${s.label} (n=${s.n})`).join(", ");
      const ok = confirm(
        `Very small sample size detected: ${list}.\n\n` +
          `Statistical tests are unreliable below n=10. Continue anyway?`
      );
      if (!ok) return;
    }
  }

  const btn = $("run-analysis");
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "Running…";

  try {
    const py = await loadPyodideRuntime();
    py.globals.set("__payload_json", JSON.stringify(payload));
    const resultJson = py.runPython(
      "import json; json.dumps(run_analysis(json.loads(__payload_json)))"
    );
    const result = JSON.parse(resultJson);
    renderResults(payload, result);
  } catch (err) {
    console.error(err);
    $("results-section").hidden = false;
    $("results").innerHTML = `<p class="warning">Analysis failed: ${escapeHtml(err.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

function renderResults(payload, result) {
  $("results-section").hidden = false;
  makeCollapsible("results-section");
  const div = $("results");

  if (result.error) {
    div.innerHTML = `<p class="warning">${escapeHtml(result.error)}</p>`;
    return;
  }

  const header = describeComparison(payload);
  const sizeCheck = checkSampleSizes(payload);
  const sizeWarning = renderSampleSizeWarning(sizeCheck);

  const groupRows = result.groups
    .map((g) => {
      const nClass = g.n == null ? "" : g.n < 10 ? "n-tiny" : g.n < 30 ? "n-small" : "";
      return `<tr>
        <td>${escapeHtml(g.label)}</td>
        <td class="num ${nClass}">${g.n == null ? "—" : g.n}</td>
        <td class="num">${g.mean == null ? "—" : g.mean.toFixed(2)}</td>
        <td class="num">${g.sd == null ? "—" : g.sd.toFixed(2)}</td>
        <td class="num">${g.ci && g.ci[0] != null ? `[${g.ci[0].toFixed(2)}, ${g.ci[1].toFixed(2)}]` : "—"}</td>
      </tr>`;
    })
    .join("");

  const testRows = result.tests
    .map(
      (t) => `<tr>
        <td>${escapeHtml(t.name)}</td>
        <td class="num">${t.stat == null ? "—" : formatStat(t.stat)}</td>
        <td class="num ${t.p != null && t.p < 0.05 ? "sig" : ""}">${t.p == null ? "—" : formatP(t.p)}</td>
        <td class="num">${t.effect ? `${escapeHtml(t.effect.name)} = ${t.effect.value.toFixed(3)}` : "—"}</td>
        ${t.note ? `<td class="hint">${escapeHtml(t.note)}</td>` : "<td></td>"}
      </tr>`
    )
    .join("");

  state.lastAnalysis = { payload, result };

  div.innerHTML = `
    <p>${header}</p>
    ${sizeWarning}
    <h3>Group summary</h3>
    <table>
      <thead><tr><th>Group</th><th>n</th><th>Mean</th><th>SD</th><th>95% CI of mean</th></tr></thead>
      <tbody>${groupRows}</tbody>
    </table>
    <h3>Statistical tests</h3>
    <table>
      <thead><tr><th>Test</th><th>Statistic</th><th>p-value</th><th>Effect size</th><th></th></tr></thead>
      <tbody>${testRows}</tbody>
    </table>
    <p class="hint">For Likert data, the ordinal test (Mann-Whitney/Wilcoxon/Kruskal-Wallis) is the rigorous answer; the parametric test is shown alongside for stakeholder communication.</p>
    ${renderInterpretation(payload, result)}
    <div id="charts"></div>
  `;

  bindCopyPrompt();
  renderCharts(payload, result);
}

function renderInterpretation(payload, result) {
  if (result.error || !result.tests || result.tests.length === 0) return "";

  let body = "";
  if (payload.type === "between-groups") body = interpretBetweenGroups(payload, result);
  else if (payload.type === "pre-post" || payload.type === "between-questions")
    body = interpretPaired(payload, result);
  else if (payload.type === "benchmark") body = interpretBenchmark(payload, result);

  if (!body) return "";

  return `
    <div class="interpretation-panel">
      <h3>What does this mean?</h3>
      ${body}
      <div class="prompt-row">
        <button class="copy-prompt" type="button">Copy explanation prompt for ChatGPT</button>
        <span class="hint">Paste a tailored prompt with these numbers into your LLM of choice for a deeper walkthrough.</span>
      </div>
    </div>
  `;
}

function getPrimaryTests(result) {
  const ordinal = result.tests.find(
    (t) => t.name.toLowerCase().includes("ordinal") && t.p != null
  );
  const parametric = result.tests.find(
    (t) => t.name.toLowerCase().includes("parametric") && t.p != null
  );
  return { ordinal, parametric, primary: ordinal || parametric };
}

function effectMagnitudeLabel(value, effectName) {
  const m = Math.abs(value);
  const name = (effectName || "").toLowerCase();
  if (name.includes("eta") || name.includes("epsilon") || name.includes("omega")) {
    // Thresholds for variance-explained measures (eta-squared, epsilon-squared, omega-squared)
    if (m < 0.01) return "trivially small";
    if (m < 0.06) return "small";
    if (m < 0.14) return "medium";
    return "large";
  }
  if (name.includes("biserial")) {
    // Rank-biserial r is bounded [-1, 1] like a correlation; use correlation thresholds
    if (m < 0.1) return "trivially small";
    if (m < 0.3) return "small";
    if (m < 0.5) return "medium";
    return "large";
  }
  // Cohen's d / d_z thresholds
  if (m < 0.2) return "trivially small";
  if (m < 0.5) return "small";
  if (m < 0.8) return "medium";
  return "large";
}

function interpretBetweenGroups(payload, result) {
  const { primary, parametric } = getPrimaryTests(result);
  if (!primary) return "";
  const p = primary.p;
  const effectValue = parametric?.effect?.value ?? 0;
  const effectName = parametric?.effect?.name ?? "Cohen's d";
  const groups = result.groups.filter((g) => g.n != null && g.n > 0);
  const ns = groups.map((g) => g.n);
  const minN = ns.length ? Math.min(...ns) : 0;
  const totalN = ns.reduce((s, n) => s + n, 0);

  const parts = [];

  if (groups.length === 2) {
    const sorted = [...groups].sort((a, b) => b.mean - a.mean);
    const [hi, lo] = sorted;
    const diff = hi.mean - lo.mean;
    parts.push(
      `<p><strong>${escapeHtml(hi.label)}</strong> averaged ${hi.mean.toFixed(2)} (n=${hi.n}), versus <strong>${escapeHtml(lo.label)}</strong> at ${lo.mean.toFixed(2)} (n=${lo.n}) — a difference of <strong>${diff.toFixed(2)} points</strong> on the rating scale.</p>`
    );
  } else {
    const labels = groups
      .map((g) => `<strong>${escapeHtml(g.label)}</strong> ${g.mean.toFixed(2)} (n=${g.n})`)
      .join(", ");
    parts.push(`<p>Group means: ${labels}.</p>`);
  }

  const sigPhrase =
    p < 0.05
      ? `<strong>statistically significant</strong> (p = ${formatP(p)})`
      : `<strong>not statistically significant</strong> (p = ${formatP(p)})`;
  const effectLabel = effectMagnitudeLabel(effectValue, effectName);
  parts.push(
    `<p>This difference is ${sigPhrase}, with a <strong>${effectLabel}</strong> effect size (${escapeHtml(effectName)} = ${effectValue.toFixed(2)}).</p>`
  );

  const isSmallEffect = effectMagnitudeLabel(effectValue, effectName) === "trivially small";
  if (p < 0.05 && isSmallEffect && totalN > 500) {
    parts.push(
      `<p class="callout"><strong>Big-sample caveat:</strong> with ${totalN.toLocaleString()} total responses, even tiny differences register as "significant." A small p-value here means the difference is real, not random — but it doesn't mean the difference is <em>meaningful</em>. Decide whether a ${escapeHtml(effectName)} of ${effectValue.toFixed(2)} matters for the decision you're making, not whether p &lt; 0.05.</p>`
    );
  } else if (p < 0.05 && minN < 30 && !isSmallEffect) {
    parts.push(
      `<p class="callout"><strong>Small-sample caveat:</strong> the smallest group has only n=${minN}. Significant results from small samples can be unstable — a different sample of the same population might give a noticeably different effect size.</p>`
    );
  } else if (p >= 0.05 && minN < 50) {
    parts.push(
      `<p class="callout"><strong>"Not significant" isn't "no difference":</strong> with smaller groups (smallest n=${minN}), you can only detect large effects. The difference may exist but be hidden by sample noise.</p>`
    );
  }

  return parts.join("");
}

function interpretPaired(payload, result) {
  const { primary, parametric } = getPrimaryTests(result);
  if (!primary) return "";
  const p = primary.p;
  const dz = parametric?.effect?.value ?? 0;
  const [a, b] = result.groups;
  if (!a || !b) return "";
  const diff = a.mean - b.mean;
  const n = a.n;

  const direction =
    Math.abs(diff) < 0.005
      ? "essentially identical"
      : diff > 0
        ? `higher in <strong>${escapeHtml(a.label)}</strong>`
        : `higher in <strong>${escapeHtml(b.label)}</strong>`;

  const parts = [
    `<p><strong>${escapeHtml(a.label)}</strong> averaged ${a.mean.toFixed(2)}, <strong>${escapeHtml(b.label)}</strong> averaged ${b.mean.toFixed(2)} — a within-respondent shift of <strong>${Math.abs(diff).toFixed(2)} points</strong> (${direction}), across n=${n} paired responses.</p>`,
  ];

  const sigPhrase =
    p < 0.05
      ? `<strong>statistically significant</strong> (p = ${formatP(p)})`
      : `<strong>not statistically significant</strong> (p = ${formatP(p)})`;
  const effectLabel = effectMagnitudeLabel(dz, "Cohen's d_z");
  parts.push(
    `<p>This change is ${sigPhrase}, with a <strong>${effectLabel}</strong> effect size (Cohen's d_z = ${dz.toFixed(2)}).</p>`
  );

  if (p < 0.05 && Math.abs(dz) < 0.2 && n > 500) {
    parts.push(
      `<p class="callout"><strong>Big-sample caveat:</strong> with ${n.toLocaleString()} paired responses, even very small within-respondent shifts will register as "significant." The p-value tells you the shift is real, not whether it's meaningful.</p>`
    );
  } else if (p >= 0.05 && n < 50) {
    parts.push(
      `<p class="callout"><strong>"Not significant" isn't "no difference":</strong> with only n=${n} paired responses, only large shifts will be detectable.</p>`
    );
  }

  return parts.join("");
}

function interpretBenchmark(payload, result) {
  const { primary, parametric } = getPrimaryTests(result);
  if (!primary) return "";
  const p = primary.p;
  const d = parametric?.effect?.value ?? 0;
  const sample = result.groups[0];
  if (!sample) return "";
  const benchmark = payload.benchmark;
  const diff = sample.mean - benchmark;

  const direction = diff > 0 ? "above" : "below";
  const parts = [
    `<p>Sample average: <strong>${sample.mean.toFixed(2)}</strong> (n=${sample.n}), which is <strong>${Math.abs(diff).toFixed(2)} points ${direction}</strong> the benchmark of ${benchmark}.</p>`,
  ];

  const sigPhrase =
    p < 0.05
      ? `<strong>statistically significant</strong> (p = ${formatP(p)})`
      : `<strong>not statistically significant</strong> (p = ${formatP(p)})`;
  const effectLabel = effectMagnitudeLabel(d);
  parts.push(
    `<p>This gap is ${sigPhrase}, with a <strong>${effectLabel}</strong> effect size (Cohen's d = ${d.toFixed(2)}).</p>`
  );

  if (p < 0.05 && Math.abs(d) < 0.2 && sample.n > 500) {
    parts.push(
      `<p class="callout"><strong>Big-sample caveat:</strong> with ${sample.n.toLocaleString()} responses, even a small gap from the benchmark looks "significant." Whether a ${Math.abs(diff).toFixed(2)}-point gap matters is a practical question, not a statistical one.</p>`
    );
  } else if (p >= 0.05 && sample.n < 50) {
    parts.push(
      `<p class="callout"><strong>"Not significant" isn't "matches the benchmark":</strong> with n=${sample.n} you can only detect a large gap.</p>`
    );
  }

  return parts.join("");
}

function buildLLMPrompt(payload, result) {
  const scaleInfo = getScaleInfo(payload);
  const lines = [];
  lines.push(
    "I ran a statistical analysis on survey data and need a plain-English explanation for a non-technical audience."
  );
  lines.push("");
  lines.push("CONTEXT");
  lines.push(`- Scale type: ${scaleInfo.scale}-point ${scaleInfo.polarity} scale`);
  lines.push(`- Comparison type: ${payload.type}`);
  if (payload.type === "between-groups") {
    const groupDesc = payload.groupCol2
      ? `"${payload.groupCol}" × "${payload.groupCol2}"`
      : `"${payload.groupCol}"`;
    lines.push(`- Comparing rating column "${payload.ratingCol}" across groups in ${groupDesc}`);
  } else if (payload.type === "pre-post") {
    lines.push(`- Paired pre/post: "${payload.colA}" vs "${payload.colB}" (same respondents)`);
  } else if (payload.type === "between-questions") {
    lines.push(`- Paired within-respondent: "${payload.colA}" vs "${payload.colB}"`);
  } else if (payload.type === "benchmark") {
    lines.push(`- Comparing "${payload.ratingCol}" against fixed benchmark = ${payload.benchmark}`);
  }
  lines.push("");
  lines.push("GROUP SUMMARY");
  for (const g of result.groups) {
    const parts = [`mean=${g.mean != null ? g.mean.toFixed(2) : "—"}`];
    if (g.n != null) parts.push(`n=${g.n}`);
    if (g.sd != null) parts.push(`sd=${g.sd.toFixed(2)}`);
    if (g.ci && g.ci[0] != null)
      parts.push(`95% CI=[${g.ci[0].toFixed(2)}, ${g.ci[1].toFixed(2)}]`);
    lines.push(`- ${g.label}: ${parts.join(", ")}`);
  }
  lines.push("");
  lines.push("STATISTICAL TESTS");
  for (const t of result.tests) {
    if (t.stat == null) continue;
    const ef = t.effect
      ? `${t.effect.name}=${t.effect.value.toFixed(3)}`
      : "—";
    lines.push(
      `- ${t.name}: statistic=${t.stat.toFixed(3)}, p-value=${t.p != null ? t.p.toFixed(4) : "—"}, effect size: ${ef}`
    );
  }
  lines.push("");
  lines.push("Please answer:");
  lines.push("1. In one or two sentences, what is the headline finding?");
  lines.push(
    "2. Explain effect size as practical importance. If eta-squared or epsilon-squared is provided, convert it to an approximate percentage of variation explained, and contrast that with the p-value."
  );
  lines.push("3. How should I describe this to stakeholders?");
  lines.push("4. What caveats or limitations should I flag?");
  lines.push("");
  lines.push("Avoid jargon; if you must use a technical term, define it.");
  return lines.join("\n");
}

function bindCopyPrompt() {
  document.querySelectorAll(".copy-prompt").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { payload, result } = state.lastAnalysis || {};
      if (!payload || !result) return;
      const prompt = buildLLMPrompt(payload, result);
      try {
        await navigator.clipboard.writeText(prompt);
        const original = btn.textContent;
        btn.textContent = "✓ Copied to clipboard";
        setTimeout(() => (btn.textContent = original), 2000);
      } catch (err) {
        const ta = document.createElement("textarea");
        ta.value = prompt;
        ta.style.cssText =
          "position:fixed;top:10%;left:10%;width:80%;height:60%;z-index:9999;padding:1rem;font-family:monospace;font-size:0.85rem;";
        document.body.appendChild(ta);
        ta.select();
        alert("Couldn't copy automatically. Press Ctrl+C, then dismiss this dialog.");
        document.body.removeChild(ta);
      }
    });
  });
}

function renderCharts(payload, result) {
  const groupData = getGroupData(payload);
  const scaleInfo = getScaleInfo(payload);
  const container = $("charts");

  const showDist = groupData.length > 0;
  container.innerHTML = `
    <div class="chart-block">
      <div class="chart-header">
        <h3>Means with 95% CI</h3>
        <button class="export-png" data-chart="bar-chart">Download PNG</button>
      </div>
      <div id="bar-chart" class="chart"></div>
    </div>
    ${showDist ? `
    <div class="chart-block">
      <div class="chart-header">
        <h3>Response distribution${scaleInfo.polarity === "bipolar" ? " (diverging)" : ""}</h3>
        <button class="export-png" data-chart="dist-chart">Download PNG</button>
      </div>
      <div id="dist-chart" class="chart"></div>
    </div>` : ""}
  `;

  renderBarChart(payload, result, scaleInfo, "bar-chart");
  if (showDist) renderDistributionChart(groupData, scaleInfo, "dist-chart");

  container.querySelectorAll(".export-png").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.chart);
      Plotly.downloadImage(target, {
        format: "png",
        filename: btn.dataset.chart,
        width: 1800,
        height: 1000,
      });
    });
  });
}

function showSmallSampleDialog(tooSmall) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("small-sample-dialog");
    const list = document.getElementById("ssd-list");
    list.innerHTML = tooSmall
      .map((s) => `<li>${escapeHtml(s.label)} (n=${s.n})</li>`)
      .join("");

    function cleanup(result) {
      dialog.removeEventListener("close", onClose);
      btnExclude.removeEventListener("click", onExclude);
      btnInclude.removeEventListener("click", onInclude);
      btnCancel.removeEventListener("click", onCancel);
      resolve(result);
    }

    const btnExclude = document.getElementById("ssd-exclude");
    const btnInclude = document.getElementById("ssd-include");
    const btnCancel = document.getElementById("ssd-cancel");

    function onExclude() { dialog.close(); cleanup("exclude"); }
    function onInclude() { dialog.close(); cleanup("include"); }
    function onCancel()  { dialog.close(); cleanup("cancel"); }
    function onClose()   { cleanup("cancel"); }

    btnExclude.addEventListener("click", onExclude);
    btnInclude.addEventListener("click", onInclude);
    btnCancel.addEventListener("click", onCancel);
    dialog.addEventListener("close", onClose);

    dialog.showModal();
  });
}

function checkSampleSizes(payload) {
  const sizes = getGroupData(payload).map((g) => ({
    label: g.label,
    n: g.values.length,
  }));
  return {
    sizes,
    tooSmall: sizes.filter((s) => s.n < 10),
    small: sizes.filter((s) => s.n >= 10 && s.n < 30),
  };
}

function renderSampleSizeWarning(check) {
  if (check.tooSmall.length === 0 && check.small.length === 0) return "";
  const msgs = [];
  if (check.tooSmall.length > 0) {
    const list = check.tooSmall
      .map((s) => `<strong>${escapeHtml(s.label)}</strong> (n=${s.n})`)
      .join(", ");
    msgs.push(
      `<p><strong>Very small samples (n&lt;10):</strong> ${list}. Treat results with extreme caution — confidence intervals will be very wide and tests have low power.</p>`
    );
  }
  if (check.small.length > 0) {
    const list = check.small
      .map((s) => `<strong>${escapeHtml(s.label)}</strong> (n=${s.n})`)
      .join(", ");
    msgs.push(
      `<p><strong>Small samples (n&lt;30):</strong> ${list}. CIs will be wider than for larger groups.</p>`
    );
  }
  return `<div class="warning-banner">${msgs.join("")}</div>`;
}

function getGroupData(payload) {
  if (payload.type === "between-groups") {
    return Object.entries(payload.groups).map(([label, values]) => ({ label, values }));
  }
  if (payload.type === "pre-post" || payload.type === "between-questions") {
    return [
      { label: payload.colA, values: payload.pairs.map((p) => p[0]) },
      { label: payload.colB, values: payload.pairs.map((p) => p[1]) },
    ];
  }
  if (payload.type === "benchmark") {
    return [{ label: "Sample", values: payload.values }];
  }
  return [];
}

function getScaleInfo(payload) {
  let col;
  if (payload.type === "between-groups" || payload.type === "benchmark") col = payload.ratingCol;
  else col = payload.colA;
  const preset = getPreset(state.cleaning[col].presetId);
  return { scale: preset.scale, polarity: preset.polarity };
}

function renderBarChart(payload, result, scaleInfo, divId) {
  const groups = result.groups.filter((g) => g.mean != null && g.ci && g.ci[0] != null);

  const trace = {
    x: groups.map((g) => g.label),
    y: groups.map((g) => g.mean),
    type: "bar",
    error_y: {
      type: "data",
      symmetric: false,
      array: groups.map((g) => g.ci[1] - g.mean),
      arrayminus: groups.map((g) => g.mean - g.ci[0]),
      color: "#333",
      thickness: 1.5,
      width: 8,
    },
    marker: { color: "#2563eb" },
    text: groups.map((g) => g.mean.toFixed(2)),
    textposition: "outside",
    hovertemplate: "%{x}<br>Mean: %{y:.2f}<br>n: %{customdata}<extra></extra>",
    customdata: groups.map((g) => g.n),
  };

  const hasCompositeLabels = payload.groupCol2 != null;
  const layout = {
    yaxis: {
      title: "Mean rating",
      range: [Math.max(0.5, 1 - 0.5), scaleInfo.scale + 0.5],
    },
    xaxis: hasCompositeLabels ? { tickangle: -30 } : {},
    margin: { t: 20, r: 20, l: 60, b: hasCompositeLabels ? 120 : 80 },
    showlegend: false,
  };

  if (payload.type === "benchmark") {
    layout.shapes = [{
      type: "line",
      x0: -0.5, x1: groups.length - 0.5,
      y0: payload.benchmark, y1: payload.benchmark,
      line: { color: "#d33", width: 2, dash: "dash" },
    }];
    layout.annotations = [{
      x: groups.length - 0.5,
      y: payload.benchmark,
      xanchor: "right",
      yanchor: "bottom",
      text: `Benchmark = ${payload.benchmark}`,
      showarrow: false,
      font: { color: "#d33", size: 12 },
    }];
  }

  Plotly.newPlot(divId, [trace], layout, { displayModeBar: false, responsive: true });
}

function renderDistributionChart(groupData, scaleInfo, divId) {
  const { scale, polarity } = scaleInfo;
  const groupLabels = groupData.map((g) => g.label);

  // counts[v-1] = percentage array (one per group) for scale value v
  const counts = [];
  for (let v = 1; v <= scale; v++) {
    counts.push(
      groupData.map((g) => {
        const total = g.values.length;
        if (total === 0) return 0;
        return (g.values.filter((x) => x === v).length / total) * 100;
      })
    );
  }

  const traces =
    polarity === "bipolar"
      ? buildBipolarTraces(counts, scale, groupLabels)
      : buildUnipolarTraces(counts, scale, groupLabels);

  const layout = {
    barmode: polarity === "bipolar" ? "relative" : "stack",
    xaxis: {
      title: "% of responses",
      zeroline: polarity === "bipolar",
      zerolinecolor: "#666",
      zerolinewidth: 1,
    },
    yaxis: { automargin: true, autorange: "reversed" },
    legend: { traceorder: "normal" },
    margin: { t: 20, r: 20, l: 100, b: 60 },
    hovermode: "closest",
  };

  if (polarity === "bipolar") {
    layout.xaxis.tickvals = [-100, -75, -50, -25, 0, 25, 50, 75, 100];
    layout.xaxis.ticktext = ["100%", "75%", "50%", "25%", "0%", "25%", "50%", "75%", "100%"];
    layout.xaxis.range = [-100, 100];
  } else {
    layout.xaxis.range = [0, 100];
    layout.xaxis.ticksuffix = "%";
  }

  Plotly.newPlot(divId, traces, layout, { displayModeBar: false, responsive: true });
}

function buildBipolarTraces(counts, scale, groupLabels) {
  const colors = bipolarColors(scale);
  const midpoint = Math.ceil(scale / 2);
  const traces = [];

  // Left side (negatives): innermost first = neutral half, then midpoint-1 ... 1
  traces.push({
    name: `${midpoint} (neutral)`,
    x: counts[midpoint - 1].map((p) => -p / 2),
    y: groupLabels,
    orientation: "h",
    type: "bar",
    marker: { color: colors[midpoint - 1] },
    legendrank: midpoint,
    showlegend: false,
    hovertemplate: `%{y}<br>${midpoint} (neutral): %{customdata:.1f}%<extra></extra>`,
    customdata: counts[midpoint - 1],
  });
  for (let v = midpoint - 1; v >= 1; v--) {
    traces.push({
      name: String(v),
      x: counts[v - 1].map((p) => -p),
      y: groupLabels,
      orientation: "h",
      type: "bar",
      marker: { color: colors[v - 1] },
      legendrank: v,
      hovertemplate: `%{y}<br>${v}: %{customdata:.1f}%<extra></extra>`,
      customdata: counts[v - 1],
    });
  }

  // Right side (positives): innermost first = neutral half, then midpoint+1 ... scale
  traces.push({
    name: `${midpoint} (neutral)`,
    x: counts[midpoint - 1].map((p) => p / 2),
    y: groupLabels,
    orientation: "h",
    type: "bar",
    marker: { color: colors[midpoint - 1] },
    legendrank: midpoint,
    hovertemplate: `%{y}<br>${midpoint} (neutral): %{customdata:.1f}%<extra></extra>`,
    customdata: counts[midpoint - 1],
  });
  for (let v = midpoint + 1; v <= scale; v++) {
    traces.push({
      name: String(v),
      x: counts[v - 1],
      y: groupLabels,
      orientation: "h",
      type: "bar",
      marker: { color: colors[v - 1] },
      legendrank: v,
      hovertemplate: `%{y}<br>${v}: %{customdata:.1f}%<extra></extra>`,
      customdata: counts[v - 1],
    });
  }

  return traces;
}

function buildUnipolarTraces(counts, scale, groupLabels) {
  const colors = unipolarColors(scale);
  const traces = [];
  for (let v = 1; v <= scale; v++) {
    traces.push({
      name: String(v),
      x: counts[v - 1],
      y: groupLabels,
      orientation: "h",
      type: "bar",
      marker: { color: colors[v - 1] },
      hovertemplate: `%{y}<br>${v}: %{x:.1f}%<extra></extra>`,
    });
  }
  return traces;
}

function bipolarColors(scale) {
  if (scale === 5) return ["#c0392b", "#e67e22", "#bdc3c7", "#7cb342", "#388e3c"];
  if (scale === 7) return ["#c0392b", "#e67e22", "#f1c40f", "#bdc3c7", "#aed581", "#7cb342", "#388e3c"];
  return Array(scale).fill("#888");
}

function unipolarColors(scale) {
  if (scale === 5) return ["#e3f2fd", "#90caf9", "#42a5f5", "#1976d2", "#0d47a1"];
  if (scale === 7) return ["#e3f2fd", "#bbdefb", "#90caf9", "#42a5f5", "#1976d2", "#0d47a1", "#062461"];
  return Array(scale).fill("#42a5f5");
}

function describeComparison(payload) {
  if (payload.type === "between-groups") {
    const groupDesc = payload.groupCol2
      ? `<strong>${escapeHtml(payload.groupCol)}</strong> × <strong>${escapeHtml(payload.groupCol2)}</strong>`
      : `<strong>${escapeHtml(payload.groupCol)}</strong>`;
    return `Comparing <strong>${escapeHtml(payload.ratingCol)}</strong> across groups in ${groupDesc}.`;
  }
  if (payload.type === "pre-post") {
    return `Pre/post paired comparison: <strong>${escapeHtml(payload.colA)}</strong> vs <strong>${escapeHtml(payload.colB)}</strong>.`;
  }
  if (payload.type === "between-questions") {
    return `Within-respondent comparison: <strong>${escapeHtml(payload.colA)}</strong> vs <strong>${escapeHtml(payload.colB)}</strong>.`;
  }
  if (payload.type === "benchmark") {
    return `<strong>${escapeHtml(payload.ratingCol)}</strong> versus benchmark <strong>${payload.benchmark}</strong>.`;
  }
  return "";
}

function formatStat(x) {
  return Math.abs(x) >= 100 ? x.toFixed(1) : x.toFixed(3);
}

function formatP(p) {
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

function showLoading(msg) {
  let el = document.getElementById("loading-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "loading-overlay";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
}

function hideLoading() {
  const el = document.getElementById("loading-overlay");
  if (el) el.hidden = true;
}

function buildAnalysisPayload() {
  const type = $("comparison-type").value;

  if (type === "between-groups") {
    const ratingCol = $("cmp-rating")?.value;
    const groupCol = $("cmp-group")?.value;
    if (!ratingCol || !groupCol) {
      alert("Pick a rating column and a group column.");
      return null;
    }
    const rawGroupCol2 = $("cmp-group2")?.value || "";
    const groupCol2 = rawGroupCol2 && rawGroupCol2 !== groupCol ? rawGroupCol2 : null;
    const ratingVals = getCleanedColumn(ratingCol);
    const groups = {};
    for (let i = 0; i < state.rows.length; i++) {
      const r = ratingVals[i];
      const g1 = state.rows[i][groupCol];
      if (r == null || g1 == null || String(g1).trim() === "") continue;
      let key = String(g1);
      if (groupCol2) {
        const g2 = state.rows[i][groupCol2];
        if (g2 == null || String(g2).trim() === "") continue;
        key = `${key} | ${String(g2)}`;
      }
      (groups[key] ||= []).push(r);
    }
    return {
      type,
      preset: state.cleaning[ratingCol].presetId,
      ratingCol,
      groupCol,
      groupCol2: groupCol2 ?? null,
      groups,
    };
  }

  if (type === "pre-post" || type === "between-questions") {
    const colA = $("cmp-rating-a")?.value;
    const colB = $("cmp-rating-b")?.value;
    if (!colA || !colB) {
      alert("Pick both rating columns.");
      return null;
    }
    if (colA === colB) {
      alert("Pick two different rating columns.");
      return null;
    }
    const a = getCleanedColumn(colA);
    const b = getCleanedColumn(colB);
    const pairs = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] != null && b[i] != null) pairs.push([a[i], b[i]]);
    }
    return {
      type,
      preset: state.cleaning[colA].presetId,
      colA,
      colB,
      pairs,
    };
  }

  if (type === "benchmark") {
    const ratingCol = $("cmp-rating")?.value;
    const benchmark = Number($("cmp-benchmark")?.value);
    if (!ratingCol || Number.isNaN(benchmark)) {
      alert("Pick a rating column and enter a benchmark value.");
      return null;
    }
    const values = getCleanedColumn(ratingCol).filter((v) => v != null);
    return {
      type,
      preset: state.cleaning[ratingCol].presetId,
      ratingCol,
      benchmark,
      values,
    };
  }

  return null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

makeCollapsible("upload-section");
