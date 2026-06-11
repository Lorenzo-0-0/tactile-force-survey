# TF-M3PF Survey — Project Page

Project page for **"Tactile/Force-grounded Robot Intelligence: A Survey of Multi-modal
Learning and Multi-phase Policy Architectures"** (NTU Singapore, submitted to ACM).

Pure static HTML/CSS/JS — no build step. The centerpiece is the **Framework Explorer**:
the paper's Fig. 2 rebuilt as an interactive component. Hover any module to surface its
papers in the sidebar; select a paper to trace its full pipeline through the framework.

## Develop

```bash
python3 -m http.server 8460
# → http://localhost:8460   (http needed: ES modules + fetch of data/*.json)
```

## Data pipeline (tools/)

All explorer data is generated, never hand-typed:

| Script | Input | Output |
|---|---|---|
| `extract_pptx_framework.py` | `draw main figure ver2.pptx` (Fig. 2 source) | `data/framework.json` |
| `build_papers.py` | paper PDF refs pages + `reference.bib` | `data/papers.json` |
| `validate_data.py` | both JSONs | hard gate (exit 1 on any inconsistency) |
| `convert_figs.sh` | LaTeX `figs/*.pdf` | `assets/images/*.{png,webp}` |

```bash
python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt
tools/.venv/bin/python tools/extract_pptx_framework.py
tools/.venv/bin/python tools/build_papers.py
tools/.venv/bin/python tools/validate_data.py   # must pass before committing data changes
bash tools/convert_figs.sh
```

## Deep links

`#ref-42` pins paper [42] and lights its pipeline; `#box-fusion-vfs` pins the VFS
fusion module. Both survive cold loads.

## Placeholders to fill before going public

- Paper / arXiv buttons (`data-placeholder="paper-pdf"` / `"arxiv"` in index.html)
- BibTeX entry (update once the arXiv/DOI record exists)
