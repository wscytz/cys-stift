import { useEffect, useState } from 'react'

/**
 * 列表入场「只播一次」守卫(配合 shared.css 的 .list-steady)。
 *
 * .tile/.row 的 tile-in 入场挂在元素挂载上;列表页的筛选/搜索会让过滤后
 * 重新出现的卡片重挂载 → 入场动画按按键重放,打字时全是噪音。页面挂载后
 * entranceMs 内允许播,之后给容器加 .list-steady 关掉动画 —— 后续数据驱动的
 * 重渲染不再重放(tile-in 终态 = 无位移全不透明,切换无视觉跳变)。
 *
 * 挂在页面级 main 上,覆盖该页所有列表视图(archive 的 grid/timeline 双视图等)。
 */
export function useListSteady(entranceMs = 700) {
  // tile-in 总时长 = 300ms + 最大 320ms nth-child 延迟,700ms 已覆盖
  const [steady, setSteady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSteady(true), entranceMs)
    return () => clearTimeout(t)
  }, [entranceMs])
  return steady
}
