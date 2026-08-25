import type { ReactNode } from 'react'
import styles from './data-table.module.css'

export interface DataTableColumn<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  /** 列宽(CSS width 值,如 "120px" / "25%");缺省自动。 */
  width?: string
  align?: 'left' | 'right'
}

export interface DataTableProps<T> {
  /** 列定义(顺序即渲染顺序)。 */
  columns: readonly DataTableColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  /** 空态文案(置于一整行内,mono 小字居中)。 */
  empty?: ReactNode
  /** table 的无障碍名。 */
  ariaLabel: string
}

/**
 * Swiss Editorial 数据表(DESIGN.md Data Tables):
 * 48px 行高、1px 水平分隔线、表头大写 Space Grotesk、行 hover 白底。
 * 真表格语义(thead/tbody/th[scope])自带屏幕阅读器结构;样式零圆角零阴影。
 */
export function DataTable<T>({ columns, rows, rowKey, empty, ariaLabel }: DataTableProps<T>) {
  return (
    <table className={styles.table} aria-label={ariaLabel}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              style={c.width ? { width: c.width } : undefined}
              className={`${styles.th} ${c.align === 'right' ? styles['th--align-right'] : ''}`}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && empty !== undefined ? (
          <tr>
            <td className={styles.empty} colSpan={columns.length}>
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)} className={styles.tr}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`${styles.td} ${c.align === 'right' ? styles['td--align-right'] : ''}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}
