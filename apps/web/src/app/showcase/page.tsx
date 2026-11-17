import type { Metadata } from 'next'
import { ShowcaseContent } from './showcase-content'

export const metadata: Metadata = {
  title: "产品展示 — cy's Stift",
  description: 'cy\'s Stift 的工作流演示：捕获、收件箱、画布、搜索与工作台；本地优先，画布也能用文字编辑。',
}

export default function ShowcasePage() {
  return <ShowcaseContent />
}
