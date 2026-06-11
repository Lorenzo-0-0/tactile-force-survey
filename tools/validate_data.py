#!/usr/bin/env python3
"""HARD GATE for data/papers.json + data/framework.json.

Exits 1 on any failure. Run after extract_pptx_framework.py and
build_papers.py.
"""

import json
import random
import sys
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parent.parent
PAPERS_JSON = SITE_ROOT / "data" / "papers.json"
FRAMEWORK_JSON = SITE_ROOT / "data" / "framework.json"
DRAFT_JSON = SITE_ROOT / "tools" / "framework.draft.json"
AUDIT_JSON = SITE_ROOT / "tools" / "papers.match_audit.json"

N_REFS = 189

# Transcribed independently from the published figure — if these mismatch,
# investigate the extraction before overriding.
SANITY = {
    "fusion.vfs": [2, 15, 34, 41, 53, 59, 71, 74, 98, 100, 102, 126, 130,
                   185, 186],
    "control.impedance": [1, 9, 17, 41, 54, 102, 107, 126, 154, 176],
    "intermediate.k": [2, 59, 71, 123],
}

failures = []


def check(ok, msg):
    print(("PASS  " if ok else "FAIL  ") + msg)
    if not ok:
        failures.append(msg)


def iter_boxes(fw):
    for comp in fw["components"]:
        for box in comp["boxes"]:
            yield box
    for band in fw["bands"]:
        for grp in band["groups"]:
            for box in grp["boxes"]:
                yield box


def main():
    papers_doc = json.loads(PAPERS_JSON.read_text())
    fw = json.loads(FRAMEWORK_JSON.read_text())
    draft = json.loads(DRAFT_JSON.read_text())
    audit = json.loads(AUDIT_JSON.read_text())
    papers = papers_doc["papers"]

    print("== papers.json ==")
    ids = [p["id"] for p in papers]
    check(ids == list(range(1, N_REFS + 1)),
          f"ids exactly 1..{N_REFS}, unique, in order")
    bad = [p["id"] for p in papers
           if not (p.get("title") and p.get("authors") and p.get("year"))]
    check(not bad, f"every paper has title/authors/year (missing: {bad})")
    keys = [p["key"] for p in papers]
    dups = sorted({k for k in keys if keys.count(k) > 1})
    check(not dups, f"no bib key used twice (dups: {dups})")
    n_url = sum(1 for p in papers if p.get("url"))
    print(f"INFO  urls: {n_url}/{N_REFS} ({100 * n_url / N_REFS:.1f}% with links)")

    print("\n== framework.json ==")
    boxes = list(iter_boxes(fw))
    box_ids = [b["id"] for b in boxes]
    dup_boxes = sorted({b for b in box_ids if box_ids.count(b) > 1})
    check(not dup_boxes, f"box ids unique ({len(box_ids)} boxes, "
                         f"dups: {dup_boxes})")
    paper_ids = set(ids)
    bad_refs = sorted({r for b in boxes for r in b["refs"]
                       if not (1 <= r <= N_REFS) or r not in paper_ids})
    check(not bad_refs,
          f"every refs[] value in [1,{N_REFS}] and present in papers.json "
          f"(bad: {bad_refs})")

    distinct = sorted({r for b in boxes for r in b["refs"]})
    print(f"INFO  coverage: {len(distinct)}/{N_REFS} papers appear in >=1 "
          f"figure box ({100 * len(distinct) / N_REFS:.1f}%) — surveys/"
          f"background refs are expected to be absent")

    fw_total = sum(len(b["refs"]) for b in boxes)
    draft_total = draft["totals"]["ref_occurrences"]
    check(fw_total == draft_total,
          f"cross-check vs PPTX raw dump: framework.json ref occurrences "
          f"({fw_total}) == draft dump ({draft_total})")

    print("\n== sanity (independently transcribed from published figure) ==")
    by_id = {b["id"]: b for b in boxes}
    for bid, expected in SANITY.items():
        got = by_id.get(bid, {}).get("refs")
        check(got == expected, f"{bid} refs == {expected} (got {got})")

    print("\n== spot-check: 10 random (refNum, PDF entry, bib title) ==")
    rng = random.Random(20260611)
    by_num = {p["id"]: p for p in papers}
    for num in sorted(rng.sample(range(1, N_REFS + 1), 10)):
        pdf60 = audit[str(num)]["pdf_text"][:60]
        print(f"  [{num:3d}] pdf: {pdf60}")
        print(f"        bib: {by_num[num]['title'][:80]}  "
              f"({by_num[num]['key']})")

    print()
    if failures:
        print(f"VALIDATION FAILED — {len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("VALIDATION PASSED")


if __name__ == "__main__":
    main()
