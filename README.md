# Survey Lab

Analyze Likert and categorical survey data in the browser. No backend, no upload — your CSV stays on your machine.

## Run locally

The simplest path:

```
python -m http.server 8000
```

then open http://localhost:8000. A local server is recommended over opening `index.html` directly so Pyodide (added in a later step) can fetch its packages without `file://` CORS issues.

## Status

v1 complete. Upload a CSV, mark column types, clean rating values against a preset, choose a comparison, run.

## What it does

- **Comparisons**: between groups (2 or 3+), pre/post paired, between two questions, versus a benchmark value
- **Tests** (run automatically per comparison type):
  - Likert data shows both ordinal and parametric results side-by-side
  - Between groups: Welch's t / Mann-Whitney U (2 groups); ANOVA / Kruskal-Wallis (3+)
  - Paired: paired t-test / Wilcoxon signed-rank
  - Benchmark: one-sample t-test / one-sample Wilcoxon
  - Each test reports stat, p-value, effect size, and 95% CIs on group means
- **Sample size guardrails**: confirm dialog if any group has n<10; warning banner if any group has n<30
- **Charts**:
  - Means with 95% CI error bars (vertical bar chart)
  - Response distribution as horizontal stacked bar — diverging for bipolar presets, standard for unipolar
- **PNG export**: 1800×1000 per chart

## Not in v1

- Multiple-comparison correction (Holm-Bonferroni) — relevant once we add running many questions at once
- Post-hoc tests (Dunn for Kruskal-Wallis, Tukey for ANOVA) — overall test says "groups differ"; identifying *which* groups requires post-hoc
- Long-format pre/post (one row per response with a time column + respondent ID) — wide format only
- NPS scale

## Stack

- Pyodide (scipy.stats, statsmodels) for stats — loaded on demand when the user runs analysis, so first interactions stay fast
- Plotly.js for charts
- PapaParse for CSV parsing
- Vanilla JS, no framework

## Bundled presets

Defined in `presets.json`. Each carries a polarity tag (bipolar/unipolar) that drives the distribution chart layout.

- 5pt agree-disagree (bipolar)
- 5pt satisfaction (bipolar)
- 5pt intensity (unipolar)
- 5pt frequency (unipolar)
- 7pt agree-disagree (bipolar)
- 7pt satisfaction (bipolar)

Adding more is a single-file edit.
