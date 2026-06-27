#!/usr/bin/env bash
# design-guard.sh — UI 设计系统守卫(L1 发布前 + L2 审计跑)
# 详见 docs/development/acceptance-plan.md §三
#
# 5 条 grep 规则扫描违规。输出每条命中 + 末尾总结。
# 判据:零违规才过(允许的例外:readToken 第 2 参数 fallback、token 定义文件、注释/测试)。
# 人眼复核命中行 —— 脚本只负责"把可疑点捞出来",不自动判死刑。
#
# 用法:bash scripts/design-guard.sh
# 退出码:0=零违规,1=有违规(需复核)

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 扫描范围:web 源码 + 共享 UI(canvas-engine 是 Canvas 2D 像素绘制,允许 hex fallback)
WEB_SRC="apps/web/src"
UI_SRC="packages/ui/src"

red() { printf '\033[31m%s\033[0m\n' "$1"; }
ylw() { printf '\033[33m%s\033[0m\n' "$1"; }
grn() { printf '\033[32m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m%s\033[0m\n' "$1"; }

violations=0
section() { printf '\n%s %s\n' "$(ylw "▶")" "$(ylw "$1")"; }

# ──────────────────────────────────────────────────────────────
# 1. 组件层无 hex 硬编码(颜色只走 var(--color-*))
#    允许:readToken('--x', '#fff') 第 2 参数 / token 定义文件(tokens.css/.ts) / 测试
section "1. 组件层 hex 硬编码(允许:readToken fallback / token 定义 / 测试)"
hex_hits=$(grep -rnE '#[0-9a-fA-F]{3,6}\b' "$WEB_SRC" 2>/dev/null \
  | grep -v "node_modules" \
  | grep -vE "readToken\([^)]*,[^)]*#" \
  | grep -vE "tokens\.(css|ts)|tailwind-preset" \
  | grep -vE "__tests__/|\.test\." \
  || true)
if [ -n "$hex_hits" ]; then
  printf '%s\n' "$hex_hits" | head -20
  violations=$((violations + 1))
  dim "  ↑ 复核:是否真违规(fallback 第 2 参数已被排除)"
else
  grn "  ✓ 无 hex 硬编码"
fi

# ──────────────────────────────────────────────────────────────
# 2. 禁第 7 色(Bauhaus 只 6 色:red/yellow/blue/black/white/gray)
section "2. 第 7 色(green/teal/purple/orange/pink)"
seventh=$(grep -rnEiw "green|teal|purple|orange|pink" "$WEB_SRC" "$UI_SRC" 2>/dev/null \
  | grep -v "node_modules" \
  | grep -vE "^\s*//|^\s*\*|/\*" \
  | grep -vE "__tests__/|\.test\." \
  || true)
if [ -n "$seventh" ]; then
  printf '%s\n' "$seventh" | head -20
  violations=$((violations + 1))
  dim "  ↑ 复核:注释已排除;DSL colorOf 的 green 映射注释允许"
else
  grn "  ✓ 无第 7 色"
fi

# ──────────────────────────────────────────────────────────────
# 3. 禁写死字体(全走 var(--font-*))
section "3. 写死字体名(允许:tokens 定义文件 / SVG 导出字符串)"
font=$(grep -rnE "font-family.*monospace|font-family.*'Inter'|font-family.*'Space Grotesk'" "$WEB_SRC" 2>/dev/null \
  | grep -v "node_modules" \
  | grep -vE "tokens\.(css|ts)|tailwind-preset|globals\.css" \
  | grep -vE "elements-to-svg|export-raster|export-svg" \
  || true)
if [ -n "$font" ]; then
  printf '%s\n' "$font" | head -20
  violations=$((violations + 1))
else
  grn "  ✓ 字体全走 token"
fi

# ──────────────────────────────────────────────────────────────
# 4. z-index 分层(只允许:0/10/20/30/40/100/110/9999)
section "4. z-index 魔法值(允许:0/10/20/30/40/100/110/9999)"
zbad=$(grep -rnE "z-?index:\s*[0-9]+|zIndex:\s*[0-9]+" "$WEB_SRC" 2>/dev/null \
  | grep -v "node_modules" \
  | grep -vE "z-?index:\s*(0|10|20|30|40|100|110|9999)\b|zIndex:\s*(0|10|20|30|40|100|110|9999)\b" \
  || true)
if [ -n "$zbad" ]; then
  printf '%s\n' "$zbad" | head -20
  violations=$((violations + 1))
else
  grn "  ✓ z-index 全在分层内"
fi

# ──────────────────────────────────────────────────────────────
# 5. 8px 网格(禁破坏网格的魔法值:5/6/7/9/11/13/15px,允许 1/2/4/8/10 倍数 + 字号)
section "5. 8px 网格魔法值(允许:1/2/4/8/10/12/14/16...px;字号/边框例外)"
grid=$(grep -rnE ':\s*[0-9]+px' "$WEB_SRC" 2>/dev/null \
  | grep -v "node_modules" \
  | grep -vE ":\s*(1|2|4|8|10|12|14|16|18|20|24|28|30|32|36|40|44|48|56|60|64|69|72|80|96|120|128|160|168|200|240|360)px" \
  | grep -vE "__tests__/|\.test\." \
  || true)
if [ -n "$grid" ]; then
  printf '%s\n' "$grid" | head -25
  violations=$((violations + 1))
  dim "  ↑ 复核:69px(--app-menu-height)/72px(布局偏移)是已知魔法数,记录待清"
else
  grn "  ✓ 8px 网格遵守"
fi

# ──────────────────────────────────────────────────────────────
printf '\n'
if [ "$violations" -eq 0 ]; then
  grn "✓ 设计系统守卫:零违规"
  exit 0
else
  red "✗ 设计系统守卫:$violations 条规则有命中,需人眼复核(见上)"
  dim "  复核通过的无害命中可忽略;真违规修了再发版"
  exit 1
fi
