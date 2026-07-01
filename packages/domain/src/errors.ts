/**
 * 持久化配额失败(localStorage 满 / 隐私模式 / 磁盘满)。
 *
 * CardRepository 的 insert/update/delete 在持久化失败时抛此错(内存已回滚)。
 * - insert:CardService.create/createWithId 透传 → capture 链路靠 promise rejection
 *   捕获,保留草稿 + 报错(H2 fix)。
 * - update/delete:CardService.write 捕获 → 返失败值(null/false),不透传到调用方
 *   (保护「忽略返回值」的 writeback/toggle-pin,quota-update-fix)。
 *
 * 定义在 domain(零依赖)而非 web:它是 CardRepository 契约的失败模式,domain
 * 的 CardService 要 instanceof 捕获它。web db-client 实现抛、domain 定义契约。
 */
export class StorageQuotaError extends Error {
  constructor(message = 'storage quota exceeded — card not persisted') {
    super(message)
    this.name = 'StorageQuotaError'
  }
}
