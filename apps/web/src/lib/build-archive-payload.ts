'use client'

import { buildExportPayload } from './export-service'
import type { ArchivePayload, MediaAssetMeta } from './archive-store'
import type { MediaAssetData } from './media-store'

/**
 * 构建存档 payload(spec D3):复用 buildExportPayload(已读全量含 freeform OPFS),
 * 只多一步 —— mediaAssets 每条剥 dataUrl(base64 二进制是存储大头,查档价值低;
 * 元数据 id/kind/mimeType/byteSize/createdAt/checksum 留)。
 *
 * 返回 ArchivePayload(= ExportPayload 形,mediaAssets 类型收窄到 MediaAssetMeta map)。
 * 其余字段(cards / canvases / freeform / settings / drafts / canvasView)原样透传 →
 * buildExportPayload 将来加字段不丢(drift lock)。
 */
export async function buildArchivePayload(): Promise<ArchivePayload> {
  const exp = await buildExportPayload()
  const mediaAssets: Record<string, MediaAssetMeta> = {}
  for (const [id, raw] of Object.entries(exp.mediaAssets ?? {})) {
    const a = raw as MediaAssetData
    const { dataUrl: _drop, ...meta } = a // 剥 dataUrl,留元数据
    mediaAssets[id] = meta as MediaAssetMeta
  }
  return {
    ...(exp as unknown as Record<string, unknown>),
    cards: exp.cards,
    mediaAssets,
  } as unknown as ArchivePayload
}
