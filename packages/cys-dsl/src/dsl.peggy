// cys-dsl grammar — Peggy 声明式语法(正则 → PEG 升级)。
//
// 角色:**结构 tokenizer** —— 把单行 token 化成 {kind, ds} 结构;语义 coercion
// (Number / finite 守卫 / escape unescape / 颜色枚举校验 / elbow 拆分 / DSL_MAX_TEXT_LEN 截断)
// 在 dsl-parser.ts 包装层做(复用旧 extract 算法,不重写)。
//
// 行模型:`[kind ` 前缀提交种类 + directive*(无序重复)+ 尾部 .*(容忍残余散文)。
// `#id` 也作为 directive(idDir)进循环 —— 等价旧正则"整行任意位置提取 #id";缺失则 TS 报
// 'missing #id'(契约:[card @pos(1,2) → missing #id,而非 unrecognized)。
// directive* 末尾的 skipChunk 消费"未知非空白串",让后续已知 directive 仍能被找到 ——
// 等价旧正则的整行任意位置提取(如 from #card:1 中 from 截到 #card 后,skipChunk 吃 :1,to 仍命中)。
//
// 改本文件后跑:`pnpm --filter web gen:dsl` 重生 dsl-parser.gen.js。
// 可接受语言与旧正则 parser 等价(契约见 dsl-parser/robustness/e2e-roundtrip/sync 测试)。

Line
  = cardLine / arrowLine / rectLine / textLine / frameLine / bracketUnknown / prose

// ── card:`[card ` 提交;#id / right-of|below #anchor / create 都是 directive ──
cardLine
  = '[' 'card' sp ds:cardDir* .* { return { kind: 'card', ds: ds } }

cardDir
  = ws d:(idDir / posDir / sizeDir / colorDir / relationDir / gapDir / createDir / titleDir / contentDir / groupDir / hrefDir / skipChunk) { return d }

// ── arrow:`[arrow ` 或 `[arrow]` 提交;#id 可省([arrow]);relation(from/to) vs free(pos/size) ──
arrowLine
  = '[' 'arrow' (sp / ']') ds:arrowDir* .* { return { kind: 'arrow', ds: ds } }

arrowDir
  = ws d:(idDir / fromDir / toDir / posDir / sizeDir / colorDir / labelDir / dashDir / arrowheadDir / curveDir / routeDir / elbowDir / wikilinkDir / skipChunk) { return d }

// ── rect / text / frame:共享 freeDir(id/pos/size/color/text)──
rectLine
  = '[' 'rect' sp ds:freeDir* .* { return { kind: 'rect', ds: ds } }

textLine
  = '[' 'text' sp ds:freeDir* .* { return { kind: 'text', ds: ds } }

frameLine
  = '[' 'frame' sp ds:freeDir* .* { return { kind: 'frame', ds: ds } }

freeDir
  = ws d:(idDir / posDir / sizeDir / colorDir / textDir / groupDir / computeDir / skipChunk) { return d }

// ── [ 开头但非已知 kind(或已知 kind 缺空格如 [card])→ unrecognized diagnostic ──
// 注:freedraw 已移出 DSL([freedraw] 落到这里 → unrecognized);程序自管(R2 + 渲染)。
bracketUnknown
  = '[' .* { return { kind: 'unknown' } }

// ── 非 [ 开头(注释/散文/围栏/空)→ 静默 skip ──
prose
  = .* { return null }

// ─── directives(返回 [tag, ...rawArgs] 元组;TS 层 coerce)───
// 唯一 ID primitive:header/anchor/from/to 全部接受相同字符集。
idDir
  = id:idRef { return ['id', id] }

posDir
  = '@pos(' x:$num ',' ws y:$num ')' { return ['pos', x, y] }
  / 'at' sp '(' x:$num ',' ws y:$num ')' { return ['pos', x, y] }

sizeDir
  = '@size(' w:$num ',' ws h:$num ')' { return ['size', w, h] }

colorDir
  = '@color(' c:$([^)]+) ')' { return ['color', c] }

// relation 关键字后必接 #id(防散文里的 below 误命中)
relationDir
  = dir:$('right-of' / 'below') sp anchor:idRef { return ['rel', dir, anchor] }

gapDir
  = '@gap(' g:$num ')' { return ['gap', g] }

// create 词边界(防 created/createFoo 误命中)
createDir
  = 'create' !idChar { return ['create', true] }

fromDir
  = 'from' sp id:idRef { return ['from', id] }

toDir
  = 'to' sp id:idRef { return ['to', id] }

labelDir
  = '@label(' v:quotedString ')' { return ['label', v] }

textDir
  = '@text(' v:quotedString ')' { return ['text', v] }

// v5: 卡片内容(@title 短 / @content 长 markdown)。quotedString 的 escChar 已支持 \n 转义。
titleDir
  = '@title(' v:quotedString ')' { return ['title', v] }

contentDir
  = '@content(' v:quotedString ')' { return ['content', v] }

dashDir
  = '@dash(' c:$([^)]+) ')' { return ['dash', c] }

arrowheadDir
  = '@arrowhead(' c:$([^)]+) ')' { return ['arrowhead', c] }

routeDir
  = '@route(' c:$([^)]+) ')' { return ['route', c] }

curveDir
  = '@curve(' x:$num ',' ws y:$num ')' { return ['curve', x, y] }

elbowDir
  // 捕获原始串,TS 层分号拆分 + 过滤好坏点(复刻旧 extractElbow)
  = '@elbow(' v:$([^)]+) ')' { return ['elbow', v] }

wikilinkDir
  // 词边界(复刻旧 @wikilink\b):@wikilinkXYZ 不命中
  = '@wikilink' !idChar { return ['wikilink', true] }

// v7: 语义分组(directive,非新 kind)。quotedString 允许带空格组名(如 "Q3 规划")。
//     成员关系落 element.meta.group;组的样式/折叠是视图层关注点,不进 DSL(DSL=状态≠行为)。
groupDir
  = '@group(' v:quotedString ')' { return ['group', v] }

// v7: 卡片显式语义引用(KG 边)。`;` 分隔的 #id 列表(镜像 @elbow 的列表约定)。
//     捕获原始串,TS 层 parseHref 拆分 + 校验 + 去重 + 上限。区别于正文 [[...]]→自动箭头:
//     这是 DSL 里直接声明的、不画线的语义边,落 element.meta.href。
hrefDir
  = '@href(' v:$([^)]+) ')' { return ['href', v] }

// v7: 安全公式(仅 text 元素)。quotedString 承载表达式;apply 层用受限递归下降
//     求值器算(禁裸 eval),只引用元素几何 #id.x/y/w/h(不碰卡片内容 → 无隐私泄漏),
//     结果写 element.text,原式存 element.meta.compute(往返对称 + 每次 apply 重算)。
computeDir
  = '@compute(' v:quotedString ')' { return ['compute', v] }

// ─── lexemes ───
num
  = '-'? [0-9]+ ('.' [0-9]+)?

escChar
  = '\\' . / [^"\\]

quotedString
  = '"' v:$(escChar*) '"' { return v }

idRef
  = '#' id:$idChars { return id }

idChars
  = [a-zA-Z0-9_:-]+

idChar
  = [a-zA-Z0-9_:-]

// skipChunk:消费一个非空白串(未知指令残余 / ] 等),返回 null(被 directive* 收集后 TS 过滤)。
// 用 [^ \t] 而非 [^\s]:行已按 \n 切(Peggy 行级解析),内部只剩空格/制表符作分隔。
skipChunk
  = [^ \t]+ { return null }

ws
  = [ \t]*

sp
  = [ \t]+
