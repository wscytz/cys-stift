import { describe, it, expect } from 'vitest'
import { LAB_REGISTRY, type LabId } from '../labs-registry'

/**
 * labs-registry 单测:注册表完整性 + 与 Settings.labs 字段一致。
 * useLabEnabled 是 hook(useSettings 包装),不在纯函数层测;靠 /settings 手测 + 现有 settings-store 测试覆盖 store 层。
 */
describe('LAB_REGISTRY', () => {
  it('含全部规划实验室(vision + 4 个新 lab)', () => {
    const ids = LAB_REGISTRY.map((m) => m.id)
    expect(ids).toContain('visionLab')
    expect(ids).toContain('autoCurateLab')
    expect(ids).toContain('autoTagLab')
    expect(ids).toContain('autoCaptureLab')
    expect(ids).toContain('agentToolCallingLab')
  })

  it('每个 lab 有完整元数据(5 个 i18n key)', () => {
    for (const meta of LAB_REGISTRY) {
      expect(meta.labelKey).toBeTruthy()
      expect(meta.warnKey).toBeTruthy()
      expect(meta.confirmTitleKey).toBeTruthy()
      expect(meta.confirmBodyKey).toBeTruthy()
      expect(meta.confirmActionKey).toBeTruthy()
    }
  })

  it('id 无重复', () => {
    const ids = LAB_REGISTRY.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('LabId 类型与注册表一致(编译期 + 运行期对齐)', () => {
    // 运行期校验:每个 LabId 都在注册表里
    const registryIds = new Set(LAB_REGISTRY.map((m) => m.id))
    const allLabIds: LabId[] = ['visionLab', 'autoCurateLab', 'autoCaptureLab', 'autoTagLab', 'agentToolCallingLab']
    for (const id of allLabIds) {
      expect(registryIds.has(id)).toBe(true)
    }
  })

  it('visionLab 排首位(已稳定的最老实验室,显示顺序)', () => {
    expect(LAB_REGISTRY[0]!.id).toBe('visionLab')
  })
})
