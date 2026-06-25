# FairLens — Demo Datasets

Upload any dataset to FairLens to reproduce the audit reports.
Each pair contains: `*_encoded.csv` · `*.pkl`

---

## 1. COMPAS Recidivism `/compas/`
A real dataset used by US courts to predict whether a defendant will re-offend within 2 years. Flagged nationally by ProPublica in 2016 for racial bias — Black defendants were nearly twice as likely to be incorrectly labelled high-risk compared to white defendants.

**Upload:** Target → `two_year_recid` · Protected → `race, sex`

**Result: Score 27 / Grade F · Severity HIGH**
- 3/4 metrics failed — `sex` (SHAP 0.105 HIGH RISK) and `race` (0.061) directly drive predictions
- Equalized odds gap of 60.9pp — model identifies Black defendants as future re-offenders far less accurately than white defendants
- Reweighing has zero effect — bias is baked into `decile_score` (the COMPAS score itself) which is an input feature
- Real case: the exact bias ProPublica exposed in 2016 that influenced real US court sentencing

---

## 2. Law School Admissions `/lawschool/`
Based on the LSAC National Longitudinal Bar Passage Study — a dataset of law school applicants with LSAT scores, GPA, school tier, and bar exam outcomes. Widely studied in AI fairness research as a case where academic merit metrics carry embedded racial disparities.

**Upload:** Target → `pass_bar` · Protected → `race, sex`

**Result: Score 24 / Grade F · Severity HIGH**
- 3/4 metrics failed — `race` ranks 3rd in SHAP at 0.234 (HIGH RISK), above raw LSAT score (0.168)
- Disparate impact 0.485 — minority students pass at less than half the rate of white students
- Reweighing partially helps: equalized odds improves 0.441 → 0.243
- Real case: mirrors the Wightman (1998) LSAC study on how admissions models perpetuate access gaps

---

## 3. Diabetes Readmission `/diabetes/`
Based on the UCI Diabetes 130-US Hospitals dataset — 10 years of clinical records predicting whether a diabetic patient will be readmitted within 30 days. Chosen as a contrast case to demonstrate that FairLens scores models fairly in both directions, not just flags everything as biased.

**Upload:** Target → `readmitted_30` · Protected → `race, age_group`

**Result: Score 92 / Grade A · Severity NONE**
- All 4 metrics passed — clinical features (`number_inpatient`, `num_medications`) dominate SHAP
- `race` SHAP = 0.010, `age_group` SHAP = 0.004 — protected attributes have near-zero influence
- **Intentional contrast dataset** — shows FairLens correctly awards high scores when bias is absent
- Note: synthetic fallback produced 85.2% positive rate (vs ~11% in real UCI data) — fairness signal valid, clinical interpretation is inverted

---

## How to Reproduce
1. Upload `*_encoded.csv` + `*.pkl` to FairLens
2. Set target, protected attributes, and positive label as above
3. Click **Run Audit** — report generates in ~60 seconds
