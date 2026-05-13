import numpy as np
from scipy import stats


def ci_of_mean(a, conf=0.95):
    a = np.asarray(a, dtype=float)
    n = len(a)
    if n == 0:
        return [None, None]
    m = float(np.mean(a))
    if n < 2:
        return [m, m]
    se = float(stats.sem(a))
    if se == 0 or not np.isfinite(se):
        return [m, m]
    low, high = stats.t.interval(conf, n - 1, loc=m, scale=se)
    return [float(low), float(high)]


def cohens_d(a, b):
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    n1, n2 = len(a), len(b)
    if n1 < 2 or n2 < 2:
        return 0.0
    s1, s2 = np.var(a, ddof=1), np.var(b, ddof=1)
    pooled = np.sqrt(((n1 - 1) * s1 + (n2 - 1) * s2) / (n1 + n2 - 2))
    if pooled == 0:
        return 0.0
    return float((np.mean(a) - np.mean(b)) / pooled)


def cohens_dz(diffs):
    diffs = np.asarray(diffs, dtype=float)
    if len(diffs) < 2:
        return 0.0
    sd = np.std(diffs, ddof=1)
    if sd == 0:
        return 0.0
    return float(np.mean(diffs) / sd)


def rank_biserial_u(u, n1, n2):
    if n1 == 0 or n2 == 0:
        return 0.0
    return float(1 - (2 * u) / (n1 * n2))


def matched_pairs_rb(diffs):
    diffs = np.asarray(diffs, dtype=float)
    nonzero = diffs[diffs != 0]
    if len(nonzero) == 0:
        return 0.0
    ranks = stats.rankdata(np.abs(nonzero))
    r_plus = float(np.sum(ranks[nonzero > 0]))
    r_minus = float(np.sum(ranks[nonzero < 0]))
    total = r_plus + r_minus
    return float((r_plus - r_minus) / total) if total > 0 else 0.0


def eta_squared(arrays):
    arrays = [np.asarray(a, dtype=float) for a in arrays]
    all_vals = np.concatenate(arrays)
    if len(all_vals) == 0:
        return 0.0
    grand_mean = np.mean(all_vals)
    ss_total = float(np.sum((all_vals - grand_mean) ** 2))
    if ss_total == 0:
        return 0.0
    ss_between = float(sum(len(a) * (np.mean(a) - grand_mean) ** 2 for a in arrays))
    return ss_between / ss_total


def epsilon_squared(arrays, h_stat):
    # Bias-corrected formula: (H - k + 1) / (n - k), where k = number of groups.
    # More accurate than H/(n-1) for small samples with many groups.
    k = len(arrays)
    n = sum(len(a) for a in arrays)
    if n <= k:
        return 0.0
    return float((h_stat - k + 1) / (n - k))


def summary(label, values):
    a = np.asarray(values, dtype=float)
    n = int(len(a))
    return {
        "label": label,
        "n": n,
        "mean": float(np.mean(a)) if n else None,
        "sd": float(np.std(a, ddof=1)) if n > 1 else None,
        "ci": ci_of_mean(a),
    }


def _finite(x):
    return float(x) if x is not None and np.isfinite(x) else None


def between_groups(groups):
    labels = list(groups.keys())
    arrays = [np.asarray(groups[l], dtype=float) for l in labels]
    summ = [summary(l, a) for l, a in zip(labels, arrays)]

    if any(len(a) == 0 for a in arrays):
        return {"groups": summ, "tests": [], "error": "One or more groups has no data."}
    if len(arrays) < 2:
        return {"groups": summ, "tests": [], "error": "Need at least two groups."}

    tests = []
    if len(arrays) == 2:
        a, b = arrays
        t_stat, t_p = stats.ttest_ind(a, b, equal_var=False)
        tests.append({
            "name": "Welch's t-test (parametric)",
            "stat": _finite(t_stat),
            "p": _finite(t_p),
            "effect": {"name": "Cohen's d", "value": cohens_d(a, b)},
        })
        u_stat, u_p = stats.mannwhitneyu(a, b, alternative="two-sided")
        tests.append({
            "name": "Mann-Whitney U (ordinal)",
            "stat": _finite(u_stat),
            "p": _finite(u_p),
            "effect": {"name": "rank-biserial r", "value": rank_biserial_u(u_stat, len(a), len(b))},
        })
    else:
        f_stat, f_p = stats.f_oneway(*arrays)
        tests.append({
            "name": "One-way ANOVA (parametric)",
            "stat": _finite(f_stat),
            "p": _finite(f_p),
            "effect": {"name": "eta-squared", "value": eta_squared(arrays)},
        })
        h_stat, h_p = stats.kruskal(*arrays)
        tests.append({
            "name": "Kruskal-Wallis (ordinal)",
            "stat": _finite(h_stat),
            "p": _finite(h_p),
            "effect": {"name": "epsilon-squared", "value": epsilon_squared(arrays, h_stat)},
        })

    return {"groups": summ, "tests": tests}


def paired(pairs, label_a, label_b):
    if len(pairs) == 0:
        return {"groups": [], "tests": [], "error": "No paired rows."}
    arr = np.asarray(pairs, dtype=float)
    a, b = arr[:, 0], arr[:, 1]
    diffs = a - b

    summ = [summary(label_a, a), summary(label_b, b)]
    tests = []

    if len(a) < 2:
        return {"groups": summ, "tests": [], "error": "Need at least 2 paired rows."}

    t_stat, t_p = stats.ttest_rel(a, b)
    tests.append({
        "name": "Paired t-test (parametric)",
        "stat": _finite(t_stat),
        "p": _finite(t_p),
        "effect": {"name": "Cohen's d_z", "value": cohens_dz(diffs)},
    })

    if np.any(diffs != 0):
        w_stat, w_p = stats.wilcoxon(a, b)
        tests.append({
            "name": "Wilcoxon signed-rank (ordinal)",
            "stat": _finite(w_stat),
            "p": _finite(w_p),
            "effect": {"name": "matched-pairs rank-biserial", "value": matched_pairs_rb(diffs)},
        })
    else:
        tests.append({
            "name": "Wilcoxon signed-rank (ordinal)",
            "stat": None, "p": None,
            "effect": {"name": "matched-pairs rank-biserial", "value": 0.0},
            "note": "All paired differences are zero.",
        })

    return {"groups": summ, "tests": tests}


def vs_benchmark(values, benchmark):
    a = np.asarray(values, dtype=float)
    benchmark = float(benchmark)
    summ = [
        summary("Sample", a),
        {"label": f"Benchmark = {benchmark}", "n": None, "mean": benchmark, "sd": None,
         "ci": [benchmark, benchmark]},
    ]
    if len(a) < 2:
        return {"groups": summ, "tests": [], "error": "Need at least 2 values."}

    tests = []
    t_stat, t_p = stats.ttest_1samp(a, benchmark)
    sd = np.std(a, ddof=1)
    d = float((np.mean(a) - benchmark) / sd) if sd > 0 else 0.0
    tests.append({
        "name": "One-sample t-test (parametric)",
        "stat": _finite(t_stat),
        "p": _finite(t_p),
        "effect": {"name": "Cohen's d", "value": d},
    })

    diffs = a - benchmark
    if np.any(diffs != 0):
        w_stat, w_p = stats.wilcoxon(diffs)
        tests.append({
            "name": "Wilcoxon signed-rank (ordinal)",
            "stat": _finite(w_stat),
            "p": _finite(w_p),
            "effect": {"name": "matched-pairs rank-biserial", "value": matched_pairs_rb(diffs)},
        })

    return {"groups": summ, "tests": tests}


def run_analysis(payload):
    t = payload["type"]
    if t == "between-groups":
        result = between_groups(payload["groups"])
        result["comparison"] = t
        return result
    if t in ("pre-post", "between-questions"):
        result = paired(payload["pairs"], payload["colA"], payload["colB"])
        result["comparison"] = t
        return result
    if t == "benchmark":
        result = vs_benchmark(payload["values"], payload["benchmark"])
        result["comparison"] = t
        return result
    return {"error": f"Unknown comparison type: {t}"}
