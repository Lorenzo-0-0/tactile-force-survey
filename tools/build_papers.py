#!/usr/bin/env python3
"""Build data/papers.json: reconstruct reference entries [1]..[189] from the
paper PDF (ACM numbered style, ground truth for numbering) and match each to
a reference.bib entry by normalized-title containment / difflib ratio.

Deterministic and re-runnable; ambiguous matches are resolved via the
explicit OVERRIDES dict. Also writes tools/papers.match_audit.json with the
raw PDF entry text + match metadata for validation/spot-checks.
"""

import difflib
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

import bibtexparser
from bibtexparser.bparser import BibTexParser

PDF_PATH = (
    "/Users/lijingliang/Library/CloudStorage/OneDrive-NanyangTechnologicalUniversity/"
    "Tactile:Force-aware Robot Learning综述/Survey_Tactile_Force_aware_Robot_Learning_clean.pdf"
)
BIB_PATH = ("/Users/lijingliang/Downloads/"
            "Survey_Tactile_Force_aware_Robot_Learning___clean/reference.bib")
PDFTOTEXT = "/opt/homebrew/bin/pdftotext"
REF_PAGES = (36, 44)
N_REFS = 189

SITE_ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = SITE_ROOT / "data" / "papers.json"
AUDIT_JSON = SITE_ROOT / "tools" / "papers.match_audit.json"

# refNum -> bib key, for entries the automatic matcher cannot resolve with
# high confidence. Keep empty unless the run reports low-ratio matches.
OVERRIDES = {}

# bib key -> canonical paper URL, for entries whose reference.bib record carries
# no eprint/doi/url field (so make_url() would return None). Each link below was
# resolved by matching the paper title on the destination page (arXiv /abs/
# preferred; OpenReview/DOI where no arXiv preprint exists). These take priority
# over make_url() so the sidebar can link every figure paper. Verified 2026-06-20.
URL_OVERRIDES = {
    "ablett2024multimodal": "https://arxiv.org/abs/2311.01248",
    "aburub2026learning": "https://arxiv.org/abs/2410.19235",
    "buamanee2024bi": "https://arxiv.org/abs/2401.17698",
    "chen2025dexforce": "https://arxiv.org/abs/2501.10356",
    "collins2024forcesight": "https://arxiv.org/abs/2309.12312",
    "he2025foar": "https://arxiv.org/abs/2411.15753",
    "hou2025adaptive": "https://arxiv.org/abs/2410.09309",
    "jones2025beyond": "https://arxiv.org/abs/2501.04693",
    "kamijo2024learning": "https://arxiv.org/abs/2406.14990",
    "kang2025robotic": "https://arxiv.org/abs/2503.03998",
    "lin2025learning": "https://arxiv.org/abs/2404.16823",
    "liu2025forcemimic": "https://arxiv.org/abs/2410.07554",
    "luo2025precise": "https://arxiv.org/abs/2410.21845",
    "murooka2025tact": "https://arxiv.org/abs/2506.15146",
    "noseworthy2025forge": "https://arxiv.org/abs/2408.04587",
    "portela2024learning": "https://arxiv.org/abs/2405.01402",
    "sferrazza2024power": "https://arxiv.org/abs/2311.00924",
    "shirai2025sim": "https://openreview.net/forum?id=tdjHpiQudR",
    "sun2025vtao": "https://arxiv.org/abs/2501.03606",
    "wu2025canonical": "https://arxiv.org/abs/2409.17549",
    "wu2025tacdiffusion": "https://arxiv.org/abs/2409.11047",
    "xu2025unit": "https://arxiv.org/abs/2408.06481",
    "ye2026visual": "https://doi.org/10.1126/scirobotics.ady2869",
    "zhou2025admittance": "https://arxiv.org/abs/2409.14440",
}

HEADER_LINES = {
    "Shan et al.",
    "Manuscript submitted to ACM",
    "Tactile/Force-grounded Robot Intelligence:",
    "A Survey of Multi-modal Learning and Multi-phase Policy Architectures",
}


# --------------------------------------------------------------------------
# PDF side: reconstruct entries [1]..[189]
# --------------------------------------------------------------------------

def extract_pdf_entries():
    txt = subprocess.run(
        [PDFTOTEXT, "-f", str(REF_PAGES[0]), "-l", str(REF_PAGES[1]),
         PDF_PATH, "-"],
        check=True, capture_output=True, text=True).stdout
    lines = txt.splitlines()
    # skip everything before the References heading
    for i, ln in enumerate(lines):
        if ln.strip() == "References":
            lines = lines[i + 1:]
            break
    else:
        sys.exit("FATAL: 'References' heading not found in PDF text")

    entries = {}
    cur_num, cur_parts = None, []
    for ln in lines:
        s = ln.strip()
        if not s or s in HEADER_LINES or re.fullmatch(r"\d{1,3}", s):
            continue
        m = re.match(r"^\[(\d+)\]\s+(.*)$", s)
        if m:
            if cur_num is not None:
                entries[cur_num] = " ".join(cur_parts)
            cur_num = int(m.group(1))
            cur_parts = [m.group(2)]
        elif cur_num is not None:
            cur_parts.append(s)
    if cur_num is not None:
        entries[cur_num] = " ".join(cur_parts)

    missing = [n for n in range(1, N_REFS + 1) if n not in entries]
    if missing or len(entries) != N_REFS:
        sys.exit(f"FATAL: expected entries 1..{N_REFS}, missing={missing}, "
                 f"extra={sorted(set(entries) - set(range(1, N_REFS + 1)))}")
    return entries


# --------------------------------------------------------------------------
# bib side
# --------------------------------------------------------------------------

ACCENTS = {
    r"\'": "", r"\`": "", r'\"': "", r"\^": "", r"\~": "", r"\=": "",
    r"\.": "", r"\u": "", r"\v": "", r"\c": "", r"\k": "", r"\H": "",
    r"\b": "", r"\d": "", r"\r": "", r"\t": "",
}


NAMED_MACROS = {
    r"\textemdash": "—", r"\textendash": "–", r"\textasciitilde": "~",
    r"\&": "&", r"\%": "%", r"\_": "_", r"\#": "#",
}
GREEK = {"alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ",
         "epsilon": "ε", "theta": "θ", "lambda": "λ", "mu": "μ",
         "pi": "π", "sigma": "σ", "tau": "τ", "phi": "φ", "omega": "ω"}


def clean_latex(s):
    if s is None:
        return ""
    s = re.sub(r"\s+", " ", s).strip()
    for macro, repl in NAMED_MACROS.items():
        s = s.replace(macro, repl)
    s = re.sub(r"\\(emph|textit|textbf|textsc|texttt|mathrm|mathbf|text)\b",
               "", s)
    s = s.replace("---", "—").replace("--", "–")
    s = re.sub(r"\\[`'\"^~=.]\s*\{?(\w)\}?", r"\1", s)  # symbol accents
    s = re.sub(r"\\[uvckHbdrt]\{(\w)\}", r"\1", s)      # braced letter accents
    s = re.sub(r"(?<!\\)~", " ", s)                      # non-breaking space
    s = re.sub(r"\$([^$]*)\$", r"\1", s)                 # strip math delimiters
    s = re.sub(r"\\([a-zA-Z]+)",
               lambda m: GREEK.get(m.group(1), m.group(1)), s)
    s = s.replace("{", "").replace("}", "").replace("\\", "")
    return re.sub(r"\s+", " ", s).strip()


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def load_bib():
    parser = BibTexParser(common_strings=True)
    parser.ignore_nonstandard_types = False
    with open(BIB_PATH) as f:
        db = bibtexparser.load(f, parser)
    return db.entries


def format_authors(author_field):
    names = [a.strip() for a in re.split(r"\s+and\s+", clean_latex(author_field))
             if a.strip()]
    etal = False
    if names and names[-1].lower() in ("others", "et al."):
        names = names[:-1]
        etal = True

    def last(n):
        if "," in n:
            return n.split(",")[0].strip()
        parts = n.split()
        return parts[-1] if parts else n

    if not names:
        return ""
    if etal or len(names) >= 3:
        return f"{last(names[0])} et al."
    if len(names) == 2:
        return f"{last(names[0])} & {last(names[1])}"
    return last(names[0])


VENUE_MAP = [
    (r"robotics[:,]? science and systems|\brss\b", "RSS"),
    (r"conference on robot learning|\bcorl\b", "CoRL"),
    (r"robotics and automation letters|\bra-?l\b", "RA-L"),
    (r"transactions on robotics|\bt-?ro\b", "T-RO"),
    (r"international conference on robotics and automation|\bicra\b", "ICRA"),
    (r"intelligent robots and systems|\biros\b", "IROS"),
    (r"international journal of robotics research|\bijrr\b", "IJRR"),
    (r"neural information processing systems|\bneurips\b|\bnips\b", "NeurIPS"),
    (r"international conference on machine learning|\bicml\b", "ICML"),
    (r"international conference on learning representations|\biclr\b", "ICLR"),
    (r"computer vision and pattern recognition|\bcvpr\b", "CVPR"),
    (r"international conference on computer vision|\biccv\b", "ICCV"),
    (r"european conference on computer vision|\beccv\b", "ECCV"),
    (r"science robotics", "Science Robotics"),
    (r"transactions on machine learning research|\btmlr\b", "TMLR"),
    (r"pattern analysis and machine intelligence", "T-PAMI"),
    (r"transactions on automation science", "T-ASE"),
    (r"transactions on industrial electronics", "TIE"),
    (r"transactions on industrial informatics", "TII"),
    (r"transactions on mechatronics|\btmech\b", "T-Mech"),
    (r"transactions on haptics", "ToH"),
    (r"advanced intelligent mechatronics|\baim\b", "AIM"),
    (r"symposium on system integration|\bsii\b", "SII"),
    (r"automation science and engineering|\bcase\b", "CASE"),
    (r"humanoid robots|humanoids", "Humanoids"),
    (r"aaai", "AAAI"),
    (r"ieee access", "IEEE Access"),
    (r"\bacl\b|association for computational linguistics", "ACL"),
    (r"\bemnlp\b|empirical methods in natural language", "EMNLP"),
    (r"journal of machine learning research|\bjmlr\b", "JMLR"),
    (r"transactions on instrumentation and measurement", "TIM"),
    (r"journal of dynamic systems", "J. Dyn. Syst. Meas. Control"),
    (r"ieee journal on robotics and automation", "IEEE J. Robot. Autom."),
    (r"robot and human interactive communication|\bro-?man\b", "RO-MAN"),
    (r"robotics (?:&|and) automation magazine", "RAM"),
    (r"annual review of control", "Annu. Rev. Control Robot."),
    (r"robotics and autonomous systems", "RAS"),
    (r"arxiv", "arXiv"),
]


def short_venue(entry):
    raw = entry.get("booktitle") or entry.get("journal") or ""
    raw = clean_latex(raw)
    if not raw:
        if (entry.get("eprint") and
                "arxiv" in entry.get("archiveprefix", "arxiv").lower()):
            return "arXiv"
        if "arxiv" in (entry.get("url", "") + entry.get("note", "")).lower():
            return "arXiv"
        if entry.get("ENTRYTYPE") == "book":
            return clean_latex(entry.get("publisher", ""))[:28] or "Book"
        raw = clean_latex(entry.get("howpublished", "")) or ""
    low = raw.lower()
    for pat, short in VENUE_MAP:
        if re.search(pat, low):
            return short
    if not raw:
        return ""
    # sensible truncation <= 28 chars
    while True:
        stripped = re.sub(
            r"^(proceedings of (the )?|\d{4}\s+|\d+(st|nd|rd|th)\s+"
            r"|(ieee|acm)(/[a-z]+)?\s+)", "", raw, flags=re.I).strip()
        if stripped == raw:
            break
        raw = stripped
    if len(raw) <= 28:
        return raw
    cut = raw[:28]
    if " " in cut:
        cut = cut[:cut.rfind(" ")]
    return cut.rstrip(" ,;:-")


def make_url(entry):
    override = URL_OVERRIDES.get(entry.get("ID"))
    if override:
        return override
    if (entry.get("eprint") and
            "arxiv" in entry.get("archiveprefix", "arxiv").lower()):
        return f"https://arxiv.org/abs/{entry['eprint'].strip()}"
    for field in ("journal", "note", "howpublished", "url"):
        m = re.search(r"arxiv[:\s/]+(?:abs/)?(\d{4}\.\d{4,5})",
                      entry.get(field, ""), re.I)
        if m:
            return f"https://arxiv.org/abs/{m.group(1)}"
    if entry.get("doi"):
        return f"https://doi.org/{entry['doi'].strip()}"
    if entry.get("url"):
        return entry["url"].strip()
    return None


# --------------------------------------------------------------------------
# matching
# --------------------------------------------------------------------------

def guess_pdf_title(entry_text):
    """Heuristic: ACM style '[N] Authors. YEAR. Title. Venue...'."""
    m = re.search(r"\.\s+(?:19|20)\d{2}[a-z]?\.\s+(.*)$", entry_text)
    rest = m.group(1) if m else entry_text
    # title runs until a period followed by a space + capital/quote (venue)
    m2 = re.match(r"(.{15,}?[.?!])\s+(?=[A-Z(“])", rest)
    return m2.group(1) if m2 else rest[:200]


def main():
    pdf_entries = extract_pdf_entries()
    bib_entries = load_bib()

    keys = [e["ID"] for e in bib_entries]
    dup_keys = {k for k in keys if keys.count(k) > 1}
    if dup_keys:
        sys.exit(f"FATAL: duplicate bib keys: {sorted(dup_keys)}")
    by_key = {e["ID"]: e for e in bib_entries}
    titles_norm = {e["ID"]: norm(clean_latex(e.get("title", "")))
                   for e in bib_entries}

    assigned = {}   # refnum -> (key, method, ratio)
    used_keys = {}  # key -> refnum

    def assign(num, key, method, ratio):
        if key in used_keys:
            sys.exit(f"FATAL: bib key {key!r} matched twice "
                     f"(refs [{used_keys[key]}] and [{num}]) — add an "
                     f"override")
        assigned[num] = (key, method, ratio)
        used_keys[key] = num

    # pass 0: explicit overrides
    for num, key in OVERRIDES.items():
        if key not in by_key:
            sys.exit(f"FATAL: override [{num}] -> unknown bib key {key!r}")
        assign(num, key, "override", 1.0)

    # pass 1: normalized title containment
    for num in range(1, N_REFS + 1):
        if num in assigned:
            continue
        entry_norm = norm(pdf_entries[num])
        cands = [k for k, tn in titles_norm.items()
                 if tn and len(tn) >= 15 and k not in used_keys
                 and tn in entry_norm]
        if cands:
            best = max(cands, key=lambda k: len(titles_norm[k]))
            assign(num, best, "containment", 1.0)

    # pass 2: difflib on heuristic PDF title vs remaining bib titles
    low_confidence = []
    for num in range(1, N_REFS + 1):
        if num in assigned:
            continue
        pdf_title_norm = norm(guess_pdf_title(pdf_entries[num]))
        best_key, best_ratio = None, -1.0
        for k, tn in titles_norm.items():
            if k in used_keys or not tn:
                continue
            r = difflib.SequenceMatcher(None, pdf_title_norm, tn).ratio()
            if r > best_ratio:
                best_key, best_ratio = k, r
        if best_key is None:
            sys.exit(f"FATAL: no bib candidate left for [{num}]")
        assign(num, best_key, "fuzzy", round(best_ratio, 3))
        if best_ratio < 0.85:
            low_confidence.append(
                (num, best_ratio, pdf_entries[num][:80], best_key,
                 clean_latex(by_key[best_key].get("title", ""))[:80]))

    # build papers.json
    papers = []
    for num in range(1, N_REFS + 1):
        key, method, ratio = assigned[num]
        e = by_key[key]
        year = None
        ym = re.search(r"\d{4}", e.get("year", ""))
        if ym:
            year = int(ym.group(0))
        papers.append({
            "id": num,
            "key": key,
            "title": clean_latex(e.get("title", "")),
            "authors": format_authors(e.get("author", "")),
            "venue": short_venue(e),
            "year": year,
            "url": make_url(e),
        })

    out = {
        "meta": {"count": N_REFS, "generated": date.today().isoformat(),
                 "bibSource": "reference.bib"},
        "papers": papers,
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, indent=2, ensure_ascii=False))

    audit = {
        str(num): {
            "pdf_text": pdf_entries[num][:200],
            "key": assigned[num][0],
            "method": assigned[num][1],
            "ratio": assigned[num][2],
        } for num in range(1, N_REFS + 1)
    }
    AUDIT_JSON.write_text(json.dumps(audit, indent=2, ensure_ascii=False))

    n_cont = sum(1 for v in assigned.values() if v[1] == "containment")
    n_fuzzy = sum(1 for v in assigned.values() if v[1] == "fuzzy")
    n_over = sum(1 for v in assigned.values() if v[1] == "override")
    n_url = sum(1 for p in papers if p["url"])
    unused = sorted(set(by_key) - set(used_keys))
    print(f"OK: wrote {OUT_JSON}")
    print(f"  matches: containment={n_cont} fuzzy={n_fuzzy} "
          f"override={n_over}")
    print(f"  urls: {n_url}/{N_REFS} ({100 * n_url / N_REFS:.1f}%)")
    print(f"  unused bib keys ({len(unused)}): {unused}")
    if low_confidence:
        print("\nLOW-CONFIDENCE MATCHES (< 0.85) — review and add to "
              "OVERRIDES:", file=sys.stderr)
        for num, r, pdf_t, key, bib_t in low_confidence:
            print(f"  [{num}] ratio={r:.3f}\n    pdf: {pdf_t}\n    "
                  f"bib({key}): {bib_t}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
