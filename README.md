# 拾光集

> 每天一张图，一句话，像写信一样记录生活里的美。

**[在线体验 →](https://xzhangiilya9-hash.github.io/aesthetic-journal/)**

---

## 它是什么

拾光集是一个极简的视觉日记 Web App。每天拍一张让你觉得好看的东西，写一句当时的心情，它就安静地帮你存下来。

打开的时候，你看到的不是一个列表或者瀑布流，而是一摞信——像桌上随手叠起来的几封旧信，干花从背后长出来，你点一下就翻过一张，慢慢回看那些日子。

## 设计理念

**干花 + 旧信 + 留白。**

灵感来自 Pedro Balasso 的手绘干花拼贴和 [GardenLetters](https://gardenletters.online/) 的物理信件质感。追求的不是"好看的 UI"，而是"像一件实物"的感觉：

- **暖纸渐变背景** — 三层径向渐变叠加，屏幕上不存在一块纯色平面
- **SVG 噪点纹理** — `feTurbulence` 生成的纸面颗粒，消除数字平面感
- **真实干花四层景深** — 远景模糊淡出、中景从卡片背后长出、近景清晰压在最前，用 `blur()` + `drop-shadow()` + `opacity` 制造空间纵深
- **信件叠压** — 每张卡片有手工微调的偏移/旋转/缩放，不是等差数列，像真实地随手叠放
- **毛玻璃按钮** — `backdrop-filter: blur(20px) saturate(190%)`，多层 `inset box-shadow` 模拟玻璃厚度和斜向反光
- **字体分工** — 手写体（刘建毛草）只用在信的内容上，界面全部使用无衬线体（Manrope），克制地区分"内容"和"工具"

## 技术实现

纯前端，零框架，三个文件：

| 文件 | 职责 |
|---|---|
| `index.html` | 语义化结构：花层 → 信堆 → 导航 → 浮层 |
| `style.css` | 所有视觉：渐变、景深、纸质感、毛玻璃、动画 |
| `app.js` | 所有逻辑：GitHub API 读写、图片压缩、卡片翻阅 |

### 关键技术点

- **数据存储**：通过 GitHub Contents API 将条目（`entries.json`）和图片直接存入用户自己的 GitHub 仓库，不依赖任何后端服务
- **图片压缩**：上传前用 Canvas 将图片缩至 1600px 长边、JPEG 0.85 质量，避免仓库体积膨胀
- **Private 仓库兼容**：通过 API + Token 获取图片内容，转成 Blob URL 供 `<img>` 使用，附带内存缓存
- **PWA**：支持添加到手机主屏幕，Service Worker 缓存静态资源，二次打开秒加载
- **`[hidden]` 修复**：CSS `display:flex` 会覆盖 HTML `hidden` 属性，用 `[hidden]{display:none!important}` 显式压回
- **响应式 + 无障碍**：`prefers-reduced-motion` 支持、`safe-area-inset` 适配、键盘快捷键（空格/方向键翻信，Esc 关浮层）

## 使用方式

1. 打开 [拾光集](https://xzhangiilya9-hash.github.io/aesthetic-journal/)
2. 点右上角齿轮，填入你的 GitHub 用户名、仓库名、分支和 [Personal Access Token](https://github.com/settings/tokens)（需要 Contents 读写权限）
3. 点「写一条」，选一张图、写一句话，存下来
4. 每天随手记，积累起来就是你自己的视觉日记

**手机上像 App 一样用**：Safari 分享 → 添加到主屏幕，全屏打开无地址栏。

## 项目结构

```
├── index.html          # 页面结构
├── style.css           # 视觉样式
├── app.js              # 应用逻辑
├── sw.js               # Service Worker
├── manifest.json       # PWA 配置
├── assets/flower2/     # 透明背景干花素材（10张）
└── .github/workflows/  # GitHub Actions 自动部署
```

## License

MIT
