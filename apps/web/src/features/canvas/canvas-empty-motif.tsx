'use client'

import { useI18n } from '@/lib/i18n'

/**
 * 画布空状态 motif(A+B 对齐版)。
 * 上半:白卡(空) —箭头→ 黄卡 + 蓝手绘曲线(演示三种画布操作)。
 * 下半:虚线指引卡 + 红点 + 文案(与上半左对齐,点明建卡入口)。
 * 单个 SVG,颜色走 CSS 变量 token。pointer-events:none 不挡右键/双击。
 */
export function CanvasEmptyMotif() {
  const { t } = useI18n()
  return (
    <svg
      className="cv-empty__motif"
      width="340" height="220" viewBox="0 0 340 220"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      {/* 白卡 */}
      <rect x="20" y="20" width="78" height="54" fill="var(--color-white)" stroke="var(--color-black)" strokeWidth="2" />
      {/* 黄卡 */}
      <rect x="232" y="20" width="78" height="54" fill="var(--color-yellow)" stroke="var(--color-black)" strokeWidth="2" />
      {/* 箭头:白卡→黄卡 */}
      <line x1="100" y1="47" x2="228" y2="47" stroke="var(--color-black)" strokeWidth="2" />
      <polygon points="228,47 218,42 218,52" fill="var(--color-black)" />
      {/* 蓝手绘曲线 */}
      <path d="M40 110 Q 80 95 120 110 T 200 110 T 280 108"
        fill="none" stroke="var(--color-blue)" strokeWidth="3.5" strokeLinecap="round" />
      {/* 下半:虚线指引卡 + 红点 + 文案(左对齐上半,左 20,宽 290) */}
      <rect x="20" y="150" width="290" height="56" fill="none" stroke="var(--color-black)" strokeWidth="2" strokeDasharray="6 4" />
      <circle cx="14" cy="150" r="6" fill="var(--color-red)" opacity="0.9" />
      <text x="165" y="184" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13" fill="var(--color-black)">
        {t('canvas.emptyMotifHint')}
      </text>
    </svg>
  )
}
