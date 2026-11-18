#!/usr/bin/env python3
"""软著源程序文档生成器(中国版权保护中心格式)。

从干净树(git ls-files)取 TS/TSX/Rust/Peggy 源码(排除测试/基准),
按模块序拼接 → 前 30 页 + 后 30 页(每页 50 行;总量 ≤60 页则全文)→
A4 docx:页眉=软件全称+版本号(左)+ 第 N 页(PAGE 域,右,连续),
正文 8.5pt Consolas、显式分页符保证每页恰 50 行。

用法:
  python3 scripts/ruanzhu-source-doc.py            # 生成到 $CYS_STIFT_DOCS_DIR/docs/dachuang-ruanzhu/
  python3 scripts/ruanzhu-source-doc.py --all      # 总量 ≤ 60 页时才全文(默认同)

CYS_STIFT_DOCS_DIR 默认 ~/projects/cys-stift-docs;可用环境变量指向并排 clone。

数字纪律:生成后脚本自报统计(总行数/收录行数/页数/截断行数),写材料时以
脚本输出为准,不手抄旧数。软件全称待用户拍板——改名只动 NAME 常量重跑。
"""
import os
import subprocess
import sys
from pathlib import Path

import docx
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml.ns import qn
from docx.shared import Cm, Pt
from docx.enum.section import WD_SECTION

# ── 可调常量 ────────────────────────────────────────────────────────────────
NAME = "cy's Stift 灵感画布软件"  # ⚠️ 全称待用户拍板(冻结清单 B 组)
VERSION = "V1.5.0"
LINES_PER_PAGE = 50
FRONT_PAGES = 30
BACK_PAGES = 30
MAXCOL = 100  # 显示宽度(半角=1,全角=2)上限,超出截断(源码列表惯例)
OUT_DIR = Path(os.environ.get('CYS_STIFT_DOCS_DIR', str(Path.home() / 'projects' / 'cys-stift-docs'))) / 'docs' / 'dachuang-ruanzhu'

# 模块拼接顺序(架构自底向上:domain → dsl → engine → db → ui → web → tauri)
MODULE_ORDER = [
    'packages/domain/',
    'packages/cys-dsl/',
    'packages/canvas-engine/',
    'packages/db/',
    'packages/ui/',
    'apps/web/src/lib/',
    'apps/web/src/features/',
    'apps/web/src/app/',
    'apps/web/src/',
    'src-tauri/src/',
]


def display_width(s: str) -> int:
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)


import unicodedata  # noqa: E402  (display_width 之上只此一处,保持头部可读)


def collect_files() -> list[str]:
    files = subprocess.run(['git', 'ls-files'], capture_output=True, text=True, check=True).stdout.split()
    picked = [
        f for f in files
        if f.endswith(('.ts', '.tsx', '.rs', '.peggy'))
        and '__tests__' not in f
        and '.test.' not in f
        and '.bench.' not in f
        and '/out/' not in f
    ]

    def order(path: str):
        for i, prefix in enumerate(MODULE_ORDER):
            if path.startswith(prefix):
                return (i, path)
        return (len(MODULE_ORDER), path)

    return sorted(picked, key=order)


def gather_lines() -> tuple[list[str], dict]:
    stats = {'files': 0, 'source_lines': 0, 'total_lines': 0, 'truncated': 0}
    out: list[str] = []
    for path in collect_files():
        text = Path(path).read_text(encoding='utf-8', errors='replace')
        # 源程序量只数真实源码行,不含下面插入的「文件:」分隔头(否则每文件 +1,
        # 331 文件虚增 331 行,与申请表的行数口径对不上)。
        stats['source_lines'] += len(text.splitlines())
        sep = '// ═══' if path.endswith('.rs') else '/* ═══'
        end = '═══ */' if not path.endswith('.rs') else '═══'
        out.append(f'{sep} 文件: {path} {end}')
        stats['files'] += 1
        for line in text.splitlines():
            line = line.expandtabs(4).rstrip()
            if display_width(line) > MAXCOL:
                # 按显示宽度截断(硬切,源码列表惯例;计数入统计)
                kept, w = [], 0
                for ch in line:
                    cw = 2 if unicodedata.east_asian_width(ch) in 'WF' else 1
                    if w + cw > MAXCOL:
                        break
                    kept.append(ch)
                    w += cw
                line = ''.join(kept)
                stats['truncated'] += 1
            out.append(line)
        stats['total_lines'] = len(out)
    return out, stats


def build_docx(lines: list[str]) -> Path:
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(1.5)
    sec.top_margin, sec.bottom_margin = Cm(2.0), Cm(1.6)
    sec.header_distance = Cm(1.0)

    # 页眉:软件全称+版本号(左) | 第 N 页(PAGE 域,右)
    header = sec.header
    hp = header.paragraphs[0]
    hp.paragraph_format.tab_stops.add_tab_stop(Cm(18.0), WD_ALIGN_PARAGRAPH.RIGHT)
    run = hp.add_run(f"{NAME}  {VERSION}")
    run.font.size = Pt(9)
    run.font.name = 'Consolas'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')
    run = hp.add_run('\t第 ')
    run.font.size = Pt(9)
    fld = run._element.makeelement(qn('w:fldSimple'), {qn('w:instr'): ' PAGE '})
    r = run._element.makeelement(qn('w:r'), {})
    t = run._element.makeelement(qn('w:t'), {})
    t.text = '1'
    r.append(t)
    fld.append(r)
    run._element.addnext(fld)
    run2 = hp.add_run(' 页')
    run2.font.size = Pt(9)

    style = doc.styles['Normal']
    style.font.name = 'Consolas'
    style.font.size = Pt(8.5)
    style._element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')
    style.paragraph_format.space_before = Pt(0)
    style.paragraph_format.space_after = Pt(0)
    style.paragraph_format.line_spacing = Pt(11)

    n_pages = (len(lines) + LINES_PER_PAGE - 1) // LINES_PER_PAGE
    for i, line in enumerate(lines):
        p = doc.add_paragraph(line if line else '')
        if (i + 1) % LINES_PER_PAGE == 0 and i + 1 < len(lines):
            p.add_run().add_break(WD_BREAK.PAGE)
    out = OUT_DIR / f"源程序-{NAME.replace("'", '')}-{VERSION}-草稿.docx"
    doc.save(str(out))
    return out, n_pages


def main():
    all_lines, stats = gather_lines()
    total = len(all_lines)
    need = FRONT_PAGES * LINES_PER_PAGE + BACK_PAGES * LINES_PER_PAGE
    if total <= need:
        picked = all_lines
        mode = f'全文({total} 行 ≤ 60 页量)'
    else:
        # 中略标记占 1 行 → 后段少取 1 行,总数恰 60 页整(3000 行)
        picked = (
            all_lines[: FRONT_PAGES * LINES_PER_PAGE]
            + ['/* ═══ ……(中略,中间部分按前 30 页/后 30 页规则省略)…… ═══ */']
            + all_lines[-(BACK_PAGES * LINES_PER_PAGE - 1):]
        )
        mode = f'前 {FRONT_PAGES} 页 + 后 {BACK_PAGES} 页(总量 {total} 行)'
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out, n_pages = build_docx(picked)
    print(f'✓ {out}')
    print(f'  模式: {mode}')
    print(f'  源文件 {stats["files"]} 个 / 源程序量 {stats["source_lines"]} 行(不含文件分隔头)')
    print(f'  拼接 {stats["total_lines"]} 行;收录 {len(picked)} 行(含文件头与 1 行中略标记)→ {n_pages} 页 × {LINES_PER_PAGE} 行')
    print(f'  截断行(超 {MAXCOL} 显示列): {stats["truncated"]} 行')


if __name__ == '__main__':
    sys.exit(main())
