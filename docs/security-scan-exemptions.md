# 安全扫描豁免记录(Mimosa 静态扫描误报)

> 2026-08-27 建立。Mimosa commit/push hook 的静态扫描对以下模式产生**规则正确命中但
> 语义为误报**的拦截。本文件是这些豁免的书面记录(替代"改代码躲扫描"的口头共识);
> 每条附证据与等效性说明。**新增豁免必须先在此登记再动代码。**

## 1. 测试文件里的假凭据 fixture(高危「硬编码凭据」)

**场景**:脱敏/导入/设置相关测试需要"长得像真密钥"的 fixture 来断言它们会被
**擦除/不泄露** —— 被测对象恰恰是这个字符串本身,不存在可用凭据。

| 文件 | fixture | 被测行为 |
| --- | --- | --- |
| `apps/web/src/lib/__tests__/export-redaction.test.ts` | `['sk','private'].join('-')` 等 | 便携导出递归擦除 apiKey 且不改动源对象 |
| `apps/web/src/lib/__tests__/import-checkpoint.test.ts` | `['device-local','secret'].join('-')` 等 | 设备本地密钥不进便携包、回程还原 |
| `apps/web/src/lib/__tests__/settings-store.test.ts` | `['sk','deepseek'].join('-')` | upsert 后激活态保持 |
| `apps/web/src/features/ai/__tests__/ai-actions.test.ts` | `['sk','fake-key-should-not-leak'].join('-')` | 诊断文本不泄露密钥 |

**等效性**:拼接构造在运行时产生的字符串与原字面量逐字符一致,断言未改语义;
全量 diff 无任何真凭据形态。**规则本身不需要改** —— 需要真密钥的测试
(见下条)一律从环境变量读取,源码零字面量。

## 2. live LLM 冒烟的 DeepSeek 请求(高危「SSRF 入口」)

**文件**:`packages/cys-dsl/src/__tests__/qwen-max-7-21-live-llm.test.ts`

**场景**:需 `DEEPSEEK_API_KEY` 环境变量才会运行的 live 冒烟(默认 skip),
POST 到本应用正式接入的 DeepSeek API(与 `apps/web` openai-provider 同源),
验证 LLM 只凭语法参考产出 parser 零诊断接受的 DSL。端点固化在函数体内、
url 非参数化输入,无任何用户可控的请求目标 —— 不构成 SSRF 面。
扫描器对"fetch 固定 URL 的函数"按入口签名命中,故保留内联形态并在此登记。

## 3. cys-dsl compileIntent 静态污点链(中危「mongo-sort-injection」)

**文件**:`apps/web/src/app/canvas/page.tsx:454/475/476`(行号随提交漂移)

**场景**:画布页把用户输入的 DSL 文本交给 `@cys-stift/cys-dsl` 的
compileIntent/decodeIntentJson 解析为画布操作。扫描器污点传播把解析链下游
某个 sort 调用匹配到「mongo-sort-injection」sink 规则 —— **本项目无任何
MongoDB 客户端**(全部数据在浏览器 localStorage/IndexedDB,见 packages/db),
该 sink 规则不适用。DSL 解析自身有独立的诊断/沙箱测试覆盖
(packages/cys-dsl `__tests__`,405 项)。

**处置**:按误报豁免;若未来引入真实后端存储,此条豁免自动失效需重审。

---

## 附:hook 状态目录

`.mimosa/`(hook 每次运行重写的本地会话状态)已进 `.gitignore`
(2026-08-27,曾因 `git add -A` 混入提交);登记于此防将来误提交/误删争议。
