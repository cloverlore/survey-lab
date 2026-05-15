# Survey Lab: Statistical Tests

## Between groups, 2 groups (independent)

| | Test | Effect size |
|---|---|---|
| Ordinal | Mann-Whitney U | Rank-biserial r |
| Parametric | Welch's t-test | Cohen's d |

Each row is one independent respondent. Use this when the two groups are unrelated (e.g. different customer segments, not the same people before and after).

The tool also accepts an optional second group column, producing composite keys (e.g. "USA | Online", "USA | Retail", "UK | Online", ...). Each composite key becomes one group fed into the same tests — so two binary columns can resolve into a 3+ group ANOVA / Kruskal-Wallis comparison.

---

## Between groups, 3+ groups (independent)

| | Test | Effect size |
|---|---|---|
| Ordinal | Kruskal-Wallis H | Epsilon-squared |
| Parametric | One-way ANOVA | Eta-squared |

Same logic as the 2-group case, extended to three or more groups. These tests tell you whether any group differs; they don't say which pairs differ (post-hoc tests are on the v2 list).

---

## Pre/post paired and between two questions

Both use the same tests. The data is in wide format: each row is one respondent, two rating columns.

| | Test | Effect size |
|---|---|---|
| Ordinal | Wilcoxon signed-rank | Matched-pairs rank-biserial |
| Parametric | Paired t-test | Cohen's d_z |

If all paired differences are zero, Wilcoxon can't run. The tool reports this and sets the effect to 0.

---

## Versus a benchmark

The sample mean is tested against a fixed number you provide.

| | Test | Effect size |
|---|---|---|
| Ordinal | Wilcoxon signed-rank (one-sample form) | Matched-pairs rank-biserial |
| Parametric | One-sample t-test | Cohen's d |

Same zero-difference caveat applies to the Wilcoxon here.

---

## Effect size thresholds

The tool labels effect sizes as trivially small, small, medium, or large.

**Cohen's d and d_z**

| Label | Value |
|---|---|
| Trivially small | < 0.2 |
| Small | 0.2 to < 0.5 |
| Medium | 0.5 to < 0.8 |
| Large | ≥ 0.8 |

**Rank-biserial r**

| Label | Value |
|---|---|
| Trivially small | < 0.1 |
| Small | 0.1 to < 0.3 |
| Medium | 0.3 to < 0.5 |
| Large | ≥ 0.5 |

**Eta-squared and epsilon-squared**

| Label | Value |
|---|---|
| Trivially small | < 0.01 |
| Small | 0.01 to < 0.06 |
| Medium | 0.06 to < 0.14 |
| Large | ≥ 0.14 |

---

## Confidence intervals

All group summaries show a 95% CI of the mean, computed using the t-distribution with n-1 degrees of freedom (standard error of the mean via scipy's `stats.sem`).

---

## Sample size warnings

The tool flags groups by size and adjusts its interpretation accordingly.

- **n < 10**: very small. For between-groups, a modal dialog appears with three choices — exclude the small categories and run, include them anyway, or cancel. For paired / benchmark comparisons, a single confirm dialog asks whether to continue.
- **10 ≤ n < 30**: small. Banner notes that CIs will be wider; results still shown.
- **n > 500 with a trivially small effect**: the "big-sample trap" callout fires. A significant p-value here means the difference is detectable, not that it matters — the magnitude question becomes the live one.
- **Significant result with smallest n < 30 and non-trivial effect**: a small-sample-instability caveat is shown; the effect size could shift with a different sample of the same population.
- **Non-significant result with smallest n < 50**: a "not significant ≠ no difference" reminder is shown — only large effects are detectable at that size.

---

## Epsilon-squared note

The tool uses the bias-corrected formula: `(H - k + 1) / (n - k)`, where k is the number of groups and n is total sample size. This is more accurate than the simpler `H / (n - 1)` for small samples with many groups.
