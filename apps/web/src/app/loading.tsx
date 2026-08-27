// 路由级 loading 态(2026-08-27 之前 app 下 0 个 loading.tsx):静态导出的
// 客户端导航要现拉目标路由 JS chunk,弱网下白屏只能靠 VT 遮盖。根段挂一个
// 轻骨架(Suspense 边界在根 layout 下,任何无自有 loading 的子段导航都会落
// 到这里),复用 PageLoading 的卡片网格占位,与 DB ready 态同一视觉。
import { PageLoading } from '@/components/page-loading'

export default function Loading() {
  return <PageLoading />
}
