# 产品展示页与静态部署

`/showcase` 是 cy's Stift 的公开产品工作流展示页。它展示当前已经存在的能力边界，并链接到可实际操作的 Capture、Canvas、Workbench 和 Settings；它不是发布公告，也不把未完成的用户研究或安装包验收写成已完成。

## 本地预览

```bash
pnpm --filter web dev
# http://localhost:3000/showcase/
```

若默认端口被占用：

```bash
pnpm --filter web dev --port 3003
# http://localhost:3003/showcase/
```

不要在同一工作树的 dev 进程运行时执行 `next build`。两者共享 `apps/web/.next`，构建可能让旧 dev 进程继续响应但丢失全局设计 token。需要生产构建时先停 dev；构建完成后重新启动预览。

## 静态构建

Web 应用没有服务端运行时，Next.js 产物静态导出到 `apps/web/out/`：

```bash
pnpm --filter web lint
pnpm --filter web build
```

构建结果应列出 `/showcase` 为 `Static`。部署目标只需要托管 `apps/web/out/`，并支持目录索引（`/showcase/` → `showcase/index.html`）。若部署在域名子路径，需先在 Next 配置中显式设置并验证 `basePath`/`assetPrefix`；当前默认按域名根路径构建。

## 发布前检查

| 检查 | 通过标准 |
|---|---|
| 1440×900 | 标题两句稳定换行；CTA、画布示意和下一段提示可见；无页面级横向滚动 |
| 1024×768 | 全局导航切菜单抽屉；展示内容不被 sticky 菜单遮挡 |
| 768×1024 | 工作流步骤收为两列；DSL 代码块自身滚动，不撑宽页面 |
| 390×844 | 标题、两枚 CTA、画布示意和本机保存状态完整；无页面级横向滚动 |
| 键盘 | Skip link、展示导航、CTA、五个核心步骤和页脚链接均可聚焦 |
| 内容 | 不出现“唯一/第一/最好”；版本、发布状态和数据边界与 `STATE.md` 一致 |
| 控制台 | 无 error/warn；`--color-red`、`--border-thick` 等全局 token 有值 |

页面使用应用内真实设计 token 和 Lucide 图标，不加载远端字体、分析脚本或第三方图片。用户指南链接指向公开 GitHub 文档；展示页不会读取或上传卡片正文、设备标识、provider 凭据或研究样本。

## 文档同步

展示内容变化时至少检查：

- 根 [`README.md`](../../README.md) 的特性、状态和展示入口。
- [`docs/user/README.md`](../user/README.md) 的用户可见行为。
- [`docs/STATE.md`](../STATE.md) 的版本、验证证据和开放验收项。
- `pnpm docs:links` 与 `git diff --check`。
