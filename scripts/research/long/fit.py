"""
Rest-of-season and dynasty SHS AI research.

  DP_GIT=/path/to/dynastyprocess-data python3 scripts/research/long/extract.py   # ranking snapshots since 2021
  python3 scripts/research/long/build.py   # nflverse stats/snaps/xFP/injuries (cached by shs-history.ts)
  python3 scripts/research/long/ros.py     # ROS replay: ranks each in-season week, outcome = PPR points to week 17
  python3 scripts/research/long/dyn.py     # dynasty replay: preseason ranks, outcome = that season (+ next)
  python3 scripts/research/long/fit.py     # writes src/lib/services/shsResearchLong.json

Same approach as the weekly model: pairwise logistic (who outscores whom at the same position), leave one season
out, forward selection that keeps a factor only if it raises picks-right out of sample in all but one season,
coefficients shrunk (ROS 40%, dynasty 50%: fewer seasons, more caution).
"""
import json, collections, itertools, datetime
import numpy as np
from sklearn.linear_model import LogisticRegression

C = '.cache/research/'

def pairs(R, grp):
    g = collections.defaultdict(list)
    for i, r in enumerate(R): g[tuple(r[k] for k in grp)].append(i)
    P = []
    for idx in g.values():
        for a, b in itertools.combinations(idx, 2):
            if R[a]['actual'] != R[b]['actual']: P.append((a, b) if R[a]['actual'] > R[b]['actual'] else (b, a))
    return np.array(P).reshape(-1, 2)

def acc(s, P):
    s = np.asarray(s); a = s[P[:, 0]]; b = s[P[:, 1]]; m = a != b
    return 100 * np.mean(a[m] > b[m])

def curve(R):
    c = collections.defaultdict(list)
    for r in R: c[r['rank']].append(r['actual'])
    ks = sorted(c); v = np.array([np.mean(c[k]) for k in ks])
    v = np.maximum.accumulate(v[::-1])[::-1] + np.linspace(1e-3, 0, len(v))
    return dict(zip(ks, v))

def X(R, keys, cv):
    last = cv[max(cv)]
    return np.array([[cv.get(r['rank'], last)] + [cv.get(r['rank'], last) * r['F'].get(k, 0) for k in keys] for r in R])

def fit(R, keys, grp):
    cv = curve(R); A = X(R, keys, cv); P = pairs(R, grp); D = A[P[:, 0]] - A[P[:, 1]]
    D = np.vstack([D, -D]); D = D / np.std(D[:, 0]); y = np.r_[np.ones(len(P)), np.zeros(len(P))]
    b = LogisticRegression(C=0.05, fit_intercept=False, max_iter=2000).fit(D, y).coef_[0]
    return b / b[0], cv

def cvscore(R, keys, grp, shrink=1.0):
    per = {}
    for s in sorted({r['season'] for r in R}):
        tr = [r for r in R if r['season'] != s]; te = [r for r in R if r['season'] == s]; P = pairs(te, grp)
        if not len(P): continue
        b, cv = fit(tr, keys, grp); b = np.r_[1, b[1:] * shrink]
        per[s] = acc(X(te, keys, cv) @ b, P) - acc([-r['ecr'] for r in te], P)
    return float(np.mean(list(per.values()))), per

def select(R, keys, grp, shrink):
    sel, best = [], 0.0
    while True:
        cands = [(cvscore(R, sel + [k], grp), k) for k in keys if k not in sel]
        if not cands: break
        (m, per), k = max(cands, key=lambda x: x[0][0])
        if m > best + 0.05 and sum(v > 0 for v in per.values()) >= len(per) - 1: sel.append(k); best = m
        else: break
    gain, per = cvscore(R, sel, grp, shrink) if sel else (0.0, {})
    if gain <= 0: sel, gain, per = [], 0.0, {}
    b, _ = fit(R, sel, grp) if sel else (np.array([1.0]), None)
    return sel, {k: round(float(v) * shrink, 3) for k, v in zip(sel, b[1:])}, round(gain, 2), {s: round(v, 2) for s, v in per.items()}

def run(rows, grp, shrink, only=None):
    out = {}
    keys = sorted({k for r in rows for k in r['F']})
    for pos in ['QB', 'RB', 'WR', 'TE']:
        R = [r for r in rows if r['pos'] == pos]
        single = {k: round(cvscore(R, [k], grp)[0], 2) for k in keys}
        sel, beta, gain, per = select(R, only.get(pos, keys) if only else keys, grp, shrink)
        out[pos] = dict(experts=round(acc([-r['ecr'] for r in R], pairs(R, grp)), 1), n=len(R), beta=beta, gain=gain, seasons=per, single=single)
        print(pos, out[pos])
    return out

if __name__ == '__main__':
    ros = [r for r in json.load(open(C + 'ros.json')) if r['season'] < 2026]  # 2026 hasn't finished
    dyn = json.load(open(C + 'dyn.json'))
    d1 = [dict(r, actual=r['a1']) for r in dyn if r['season'] < 2026]
    d2 = [dict(r, actual=r['a1'] + (r['a2'] or 0)) for r in dyn if r['a2'] is not None]
    R = run(ros, ['season', 'week', 'pos'], 0.6)
    D1 = run(d1, ['season', 'pos'], 0.5)
    D2 = run(d2, ['season', 'pos'], 0.5)
    # Dynasty keeps only factors that earn a place on both horizons (this season, and this + next); β averaged.
    dmodel = {}
    for pos in D1:
        keep = [k for k in D1[pos]['beta'] if k in D2[pos]['beta']]
        if not keep:
            sel2, beta2, g2, per2 = select([r for r in d2 if r['pos'] == pos], list(D1[pos]['beta']), ['season', 'pos'], 0.5) if D1[pos]['beta'] else ([], {}, 0, {})
            keep = [k for k in beta2]
        beta = {k: round((D1[pos]['beta'].get(k, 0) + D2[pos]['beta'].get(k, 0)) / 2, 3) for k in keep}
        dmodel[pos] = dict(experts=D2[pos]['experts'], n=D2[pos]['n'], beta=beta,
                           gain=round((D1[pos]['gain'] + D2[pos]['gain']) / 2, 2) if beta else 0.0,
                           gain1=D1[pos]['gain'], gain2=D2[pos]['gain'], single=D2[pos]['single'])
    out = {
        'generatedAt': datetime.datetime.utcnow().isoformat() + 'Z',
        'ros': {'seasons': sorted({r['season'] for r in ros}), 'weeks': len({(r['season'], r['week']) for r in ros}), 'rows': len(ros),
                'note': 'In-season expert rest-of-season ranks (weeks 4–14, 2021–2025). Outcome: PPR points from that week to week 17. Graded pairwise within position and week.',
                'model': R},
        'dynasty': {'seasons': sorted({r['season'] for r in d2}), 'rows': len(d2),
                    'note': 'Preseason expert dynasty ranks (2021–2025). Outcome: PPR points that season and the next (2026 scaled to a full season). Factors use only the previous season.',
                    'model': dmodel},
    }
    json.dump(out, open('src/lib/services/shsResearchLong.json', 'w'), indent=1)
