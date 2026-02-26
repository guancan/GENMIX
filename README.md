# Genmix — AIGC Prompts & Tasks Manager

一款 Chrome 浏览器侧栏插件，帮助你在 ChatGPT、Gemini、即梦等 AI 平台上统一管理 Prompt 模板和任务结果。

---

## 功能特性

- 📝 Prompt 模板管理（创建、编辑、分类）
- ✅ 任务列表与执行跟踪
- 📸 结果捕获（文字、图片、视频）
- 🌐 支持平台：ChatGPT、Gemini、即梦（jimeng.jianying.com）

---

## 技术栈

- **框架**: React 19 + TypeScript
- **构建工具**: Vite + @crxjs/vite-plugin
- **样式**: Tailwind CSS
- **插件规范**: Chrome Manifest V3

---

## 开发环境运行

> 适合想参与开发或查看源码的人。

**前提条件**：需要安装 [Node.js](https://nodejs.org/) 18+

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（热更新）
npm run dev
```

启动后：
1. 打开 Chrome，地址栏输入 `chrome://extensions`
2. 右上角开启「**开发者模式**」
3. 点「**加载已解压的扩展程序**」→ 选择项目根目录

代码修改后插件会自动热更新。

---

## 构建 & 分发（给朋友/同事使用）

> 对方无需安装 Node.js，无需开终端，直接加载即可。

```bash
# 构建生产版本，输出到 dist/ 目录
npm run build
```

将生成的 `dist/` 文件夹压缩发给对方，对方按以下步骤安装：

1. 解压得到 `dist/` 文件夹
2. 打开 Chrome → `chrome://extensions`
3. 右上角开启「**开发者模式**」
4. 点「**加载已解压的扩展程序**」→ 选择 `dist/` 文件夹
5. 安装完成 ✅

---

## 自动化测试

项目使用 [Playwright](https://playwright.dev/) 进行端到端测试。

```bash
# 运行所有测试
npm test

# 有界面模式（可看到浏览器操作过程）
npm run test:headed

# 调试模式
npm run test:debug
```
