/**
 * dsl-issue-reasons — 「无法应用」原因人话化(DSL 转义对话框 + AI 确认框共用)。
 *
 * solver/sanitize/apply 的原文是给开发者的中英混杂串("relational card 的 anchor
 * 不存在"、"duplicate element id — later op overrides earlier"),直接亮给用户是行话。
 * 这里按模式族翻译;未命中回落原文(新增 reason 不改 UI 也不炸)。
 * 目录来源(2026-11-19 审核枚举):
 * - packages/cys-dsl/src/dsl-relational-solver.ts(锚点缺失/组锚/上游链/钳位/碰撞)
 * - packages/cys-dsl/src/dsl-sanitize.ts(create 冲突/重复 id/跨 kind/delete 只认 #id/
 *   端点缺失/gap 钳位/保留字组锚)
 * - apps/web/src/features/canvas/apply-layout.ts(不在画布/delete 缺失/id 冲突/已应用/compute)
 */
import { messages, type MessageKey } from '@/lib/i18n/messages'

type Translate = (k: MessageKey, params?: Record<string, string | number>) => string

/** id 字符集与 canvas-dsl 序列化校验一致:[a-zA-Z0-9_:-];引用统一带 # 前缀
 *  (用户可直接在 textarea 里搜到那个 id;DSL 指引模板里的 {anchor} 也因此是合法 DSL)。
 *  组锚名例外:grammar 裸名允许 CJK(bareGroupName)与引号空格名,用非贪婪捕获。 */
const ID = '[a-zA-Z0-9_:-]+'

function kindLabel(kind: string, t: Translate): string {
  const key = `canvas.kind.${kind}` as MessageKey
  return key in messages ? t(key) : kind
}

/** 删除指令的 kind 词必须是 parser 认识的 DSL kind；freedraw/image/line/note 等
 *  只存在于画布几何层，parser 不认这些前缀。planFree 的删除守卫对任意非卡目标
 *  都接受 `[rect #id delete]`，所以非 DSL kind 统一建议 rect（kind 文案仍显示真实类型）。 */
const DSL_KINDS = new Set(['card', 'rect', 'frame', 'text', 'arrow'])
function directiveKind(kind: string): string {
  return DSL_KINDS.has(kind) ? kind : 'rect'
}

export function humanizeApplyIssue(reason: string, t: Translate): string {
  let m: RegExpExecArray | null

  // solver:单卡锚缺失(含新建指引)
  m = new RegExp(`relational card #(${ID}) 的 anchor #(${ID}) 不存在`).exec(reason)
  if (m) return t('canvas.dslIssueAnchorMissing', { card: `#${m[1]!}`, anchor: `#${m[2]!}` })

  // solver:组锚无成员(@组名允许 CJK/空格/引号,非贪婪捕获到「 无已解成员」前)
  m = new RegExp(`relational card #[0-9a-zA-Z_:-]+ 的组锚 @(.+?) 无已解成员`).exec(reason)
  if (m) return t('canvas.dslIssueGroupAnchor', { anchor: `@${m[1]}` })

  // solver:上游链式占位
  m = new RegExp(`relational card #${ID} 的 anchor #(${ID}) 上游 anchor 缺失`).exec(reason)
  if (m) return t('canvas.dslIssueUpstreamAnchor', { anchor: `#${m[1]!}` })

  // solver/apply:id 冲突。delete 指向别的 kind 时「换 id」是错误建议——正确动作是
  // 用对应 kind 的 delete(apply planFree/planCard 跨 kind 守卫产此串)。
  // 2026-11-19 三审:文案曾固定假设"用户写的是 card delete"(「不是卡」+示例 [rect …]),
  // 对 [arrow #x delete] 目标却是 card 时自相矛盾;改为按目标真实 kind 出指令词。
  m = new RegExp(`#(${ID}) id conflict with existing ([a-z]+)`).exec(reason)
  if (m) {
    if (/^delete /i.test(reason)) {
      return t('canvas.dslIssueDeleteKindConflict', {
        id: `#${m[1]!}`,
        kind: kindLabel(m[2]!, t),
        directive: directiveKind(m[2]!),
      })
    }
    return t('canvas.dslIssueIdConflict', { id: `#${m[1]!}`, kind: kindLabel(m[2]!, t) })
  }

  // sanitize:批量内重复 id(英文原文)
  m = new RegExp(`duplicate element id #(${ID}) — later op overrides earlier`).exec(reason)
  if (m) return t('canvas.dslIssueDuplicateId', { id: `#${m[1]!}` })

  // apply:@compute 求值失败(未解析引用;其余 compute 错误回落原文)
  m = new RegExp(`^compute: unresolved ref: #(${ID})`).exec(reason)
  if (m) return t('canvas.dslIssueComputeRef', { id: `#${m[1]!}` })

  // sanitize:create 撞已有卡(中文原文;重试场景已被 hash 豁免,这里是真的新建冲突)
  m = new RegExp(`create card #(${ID}) id 已存在`).exec(reason)
  if (m) return t('canvas.dslIssueCreateExists', { id: `#${m[1]!}` })

  // sanitize/apply:引用/删除目标不在画布。delete 分流到专用文案(带 kind)。
  m = new RegExp(`(?:card|rect|arrow|text|frame) #(${ID}) (?:不存在于画布|does not exist)`).exec(reason)
  if (m) {
    if (/^delete /i.test(reason)) {
      const kind = /delete (card|rect|arrow|text|frame)/.exec(reason)?.[1] ?? 'card'
      return t('canvas.dslIssueDeleteMissing', { id: `#${m[1]!}`, kind: kindLabel(kind, t) })
    }
    return t('canvas.dslIssueNotOnCanvas', { id: `#${m[1]!}` })
  }

  // sanitize:arrow 端点缺失(中文原文)
  m = new RegExp(`arrow (?:from|to) #(${ID}) 不存在于画布`).exec(reason)
  if (m) return t('canvas.dslIssueArrowEndpoint', { id: `#${m[1]!}` })

  // apply:关系箭头端点缺失(英文原文)。UI 预览通常先被上方 sanitize 同族诊断拦下,
  // 此串出现在 applyLayout 报告/AI 路径;补上防止回落英文行话(三审补全)。
  m = new RegExp(`^arrow endpoint #(${ID}) does not exist`).exec(reason)
  if (m) return t('canvas.dslIssueArrowEndpoint', { id: `#${m[1]!}` })

  // sanitize:跨 kind(将新建而非更新)
  m = new RegExp(`(?:card|rect|text|frame) #(${ID}) 与已有 ([a-z]+) 跨 kind`).exec(reason)
  if (m) return t('canvas.dslIssueKindMismatch', { id: `#${m[1]!}`, kind: kindLabel(m[2]!, t) })

  // sanitize:delete 行混入其余指令(括号里是 @列表)
  m = /delete 行只认 #id,已忽略其余指令\((.+)\)/.exec(reason)
  if (m) return t('canvas.dslIssueDeleteOnlyId', { detail: m[1]! })

  // sanitize/solver:数值越界自动钳位(gap / 坐标边界)。
  // detail 只留纯数值,字段名走 t()(三审:detail 曾内嵌中文「间距限制到」,en 界面混语)。
  m = new RegExp(`card #[0-9a-zA-Z_:-]+ 的 gap 已限制到 ([\\d.]+)`).exec(reason)
  if (m) return t('canvas.dslIssueClamped', { field: t('canvas.organize.gap'), detail: m[1]! })
  m = new RegExp(`relational card #[0-9a-zA-Z_:-]+ 的坐标已限制到 (\\+\\/-[\\d.]+)`).exec(reason)
  if (m) return t('canvas.dslIssueClamped', { field: t('canvas.dslIssueClampCoordField'), detail: m[1]! })

  // solver:钳位后碰撞
  m = new RegExp(`card #(${ID}) 在坐标边界钳位后与 #(${ID}) 碰撞`).exec(reason)
  if (m) return t('canvas.dslIssueClampCollision', { id: `#${m[2]!}` })

  // sanitize:保留字组锚被剥除
  m = new RegExp(`card #${ID} 的组锚 @(.+?) 与内建指令同名`).exec(reason)
  if (m) return t('canvas.dslIssueReservedGroupAnchor', { anchor: `@${m[1]}` })

  // apply:依赖未提交(上游创建/写入失败)
  m = new RegExp(`dependency #(${ID}) was not committed`).exec(reason)
  if (m) return t('canvas.dslIssueDependencyNotCommitted', { id: `#${m[1]!}` })

  // apply:持久化写入失败(agent-confirm-card / 提交阶段抛错)
  if (/^(?:card content update failed|failed to (?:create|remove|update|persist) card)/i.test(reason)) {
    return t('canvas.dslIssueWriteFailed')
  }

  // apply:本次会话已应用(preview 不传 hashes,此串只在 commit 报告路径出现)
  if (reason === 'operation already applied in this session') return t('canvas.dslIssueAlreadyApplied')

  return reason
}
