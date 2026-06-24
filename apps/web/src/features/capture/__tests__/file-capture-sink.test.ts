/**
 * R2.8 回归:文件捕获链路在媒体 attach 失败(配额满)时不应造悬空卡片。
 *
 * Task 1(R2.4)让 mediaStore.attach 配额失败抛错。FileCaptureSink.submit
 * 直接 `await mediaStore.attach(file)` 后才 `service.create(...)`——attach
 * 抛错会先于 create 冒泡,submit rejects,卡片不创建(无指向不存在 asset 的
 * 悬空 MediaRef)。调用方(file-drop-handler 的 captureAndToast)已有
 * .catch + pushToast,用户收到 capture.error toast。
 *
 * 这里只断言 sink 层契约:attach 抛错 → submit rejects → service.create
 * 一次都没被调用。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileCaptureSink, fileCaptureSource } from '../file-capture-sink'
import { mediaStore } from '@/lib/media-store'
import type { CardService } from '@cys-stift/domain'

vi.mock('@/lib/media-store', () => ({
  mediaStore: { attach: vi.fn() },
}))

function fakeService(): CardService {
  return {
    create: vi.fn().mockReturnValue({ id: 'c-1' }),
  } as unknown as CardService
}

describe('FileCaptureSink — media attach failure (R2.8)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects on image attach failure without creating a card', async () => {
    vi.mocked(mediaStore.attach).mockRejectedValue(
      new Error('mediaStore.attach: storage quota exceeded'),
    )
    const service = fakeService()
    const sink = new FileCaptureSink(service)
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', {
      type: 'image/png',
    })

    await expect(
      sink.submit({
        source: fileCaptureSource('drag-drop', 'dev'),
        file,
      } as never),
    ).rejects.toThrow()

    // 关键:attach 失败时卡片绝不被创建(否则会留下引用悬空 asset 的卡)。
    expect(service.create).not.toHaveBeenCalled()
  })

  it('rejects on doc attach failure without creating a card', async () => {
    // markitdown 是动态 import;doc 分支会先 await converter.convert(file)。
    // 但 attach 在 convert 之后——我们让 convert 成功、attach 失败,
    // 验证 doc 分支同样不造悬空卡。
    vi.mocked(mediaStore.attach).mockRejectedValue(
      new Error('mediaStore.attach: storage quota exceeded'),
    )
    vi.doMock('markitdownllm', () => ({
      MarkItDown: class {
        convert() {
          return Promise.resolve({ markdown: '# hi', title: 'hi' })
        }
      },
    }))
    const service = fakeService()
    const sink = new FileCaptureSink(service)
    const file = new File([new Uint8Array([1, 2, 3])], 'a.pdf', {
      type: 'application/pdf',
    })

    await expect(
      sink.submit({
        source: fileCaptureSource('drag-drop', 'dev'),
        file,
      } as never),
    ).rejects.toThrow()

    expect(service.create).not.toHaveBeenCalled()
    vi.doUnmock('markitdownllm')
  })
})
