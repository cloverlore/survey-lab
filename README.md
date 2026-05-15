# Survey Lab

Analyze Likert and categorical survey data in the browser. No backend, no upload — your CSV stays on your machine.

**[Use the tool → cloverlore.github.io/survey-lab](https://cloverlore.github.io/survey-lab/)**

## Development — run locally

The simplest path:

```
python -m http.server 8000
```

then open http://localhost:8000. A local server is recommended over opening `index.html` directly so Pyodide (added in a later step) can fetch its packages without `file://` CORS issues.

## Status

v1 complete. Upload a CSV, mark column types, clean rating values against a preset, choose a comparison, run.

## What it does

- **Comparisons**: between groups (2 or 3+), pre/post paired, between two questions, versus a benchmark value
- **Cross-tabulation**: between-groups supports an optional second group column, producing composite keys like "USA | Online"
- **Tests** (run automatically per comparison type):
  - Likert data shows both ordinal and parametric results side-by-side
  - Between groups: Welch's t / Mann-Whitney U (2 groups); ANOVA / Kruskal-Wallis (3+)
  - Paired: paired t-test / Wilcoxon signed-rank
  - Benchmark: one-sample t-test / one-sample Wilcoxon
  - Each test reports stat, p-value, effect size, and 95% CIs on group means
- **Sample size guardrails**:
  - Between-groups: dialog offering exclude / include / cancel when any group has n<10
  - Other comparisons: confirm dialog when n<10
  - Warning banner when any group has 10 ≤ n < 30
  - "Big-sample trap" callout when n > 500 with a trivially small effect
- **Plain-English interpretation**: "What does this mean?" panel summarises the headline finding, effect-size magnitude, and sample-size caveats
- **LLM prompt export**: one-click copy of a tailored prompt (numbers + guardrails against speculation, pattern-matching, and unsupported recommendations) for ChatGPT or similar
- **Charts**:
  - Means with 95% CI error bars (vertical bar chart)
  - Response distribution as horizontal stacked bar — diverging for bipolar presets, standard for unipolar
- **PNG export**: 1800×1000 per chart
- **Scale-type guide**: built-in unipolar/bipolar diagram for users picking a preset

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

- 5pt bipolar (agree/disagree — strongly disagree → strongly agree)
- 5pt unipolar (intensity — not at all → extremely)
- 7pt bipolar (agree/disagree)
- 7pt unipolar (intensity)

Auto-mapping matches raw values to scale points by label text (case-insensitive, with leading "1- ", "(1) ", etc. prefixes stripped) and by numeric value. Unmapped rows are highlighted in red for manual fix-up. Adding more presets is a single-file edit.
