#!/usr/bin/env bash
# 字体子集化再生成脚本(2026-08-27):三 variable TTF → latin woff2 子集。
# 源 TTF 不入仓(体积大),如需全量重跑:从 Google Fonts 重新下载 variable TTF
# 放 apps/web/public/fonts/<原名>.ttf 后执行本脚本。
# 依赖:pip3 install fonttools brotli
# 产物:apps/web/public/fonts/*-latin.woff2(约 168KB,较全量 TTF -86%)
# 注意:中文与 latin 外字形不在此子集,应用内走系统字体回退(layout.tsx 注释)。
set -euo pipefail
cd "$(dirname "$0")/../apps/web/public/fonts"
UNICODES="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+FB00-FBFF"
for name in Inter JetBrainsMono SpaceGrotesk; do
  src="${name}.ttf"
  [ -f "$src" ] || { echo "缺源文件 $src(见脚本头注释获取方式),跳过"; continue; }
  pyftsubset "$src" --output-file="${name}-latin.woff2" --flavor=woff2 \
    --layout-features='*' --unicodes="$UNICODES"
  echo "✓ ${name}-latin.woff2"
done
