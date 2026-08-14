# dsh 会话时间轴插件（Session Timeline）

在 dsh WebUI 会话消息列右缘渲染一条竖直**时间轴**：每条**用户消息**（首轮消息 + steering 追问）一条短横线**刻度**，悬浮显示消息摘要与序号（`3 / 12`），点击**跳转**到对应消息（位于视口顶端 + 短暂高亮），▲▼ 按钮逐条导航，**当前刻度**随滚动高亮。颜色使用 dsh 主题令牌，深浅色自适应。

## 文件结构

- `src/model.js` — 纯逻辑模型（刻度布局 / 摘要截断 / 导航 / 当前位置插值），不依赖 DOM，可单测
- `src/shell.js` — DOM 薄壳（选择器读取、scrollTop 写入、React 渲染、监听器生命周期）
- `build.js` — 构建脚本：内联 model + shell → `client.js`（动态插件函数体）与 `lib/client.js`（常驻 bundle）
- `client.js` — 构建产物：动态 Cordis 客户端插件的完整函数体（**勿手改**）
- `lib/index.js` / `lib/client.js` — 常驻安装包形态：node half（空 apply）+ lazy-CJS 浏览器 bundle（**勿手改**）
- `cordis.patch.yml` — profile 补丁层：把 `ui-timeline` 插入浏览器插件花名册
- `package.json` — 含 `dsh.client`（web 平台）与 `dsh.bundle.patch` 声明
- `test/model.test.js` — 纯逻辑单测（node:test，零依赖）

## 开发

```sh
node test/model.test.js   # 跑单测（node --test 在沙箱内 spawn 受限，直接执行文件即可）
node build.js             # 改了 src/ 之后重新构建 client.js
```

## 安装

### 常驻安装（推荐）

```sh
# 已发布到 npm 时
dsh plugin --profile web add @hemo94931/dsh-timeline

# 或直接从 GitHub 安装（替换为实际的用户名/仓库）
dsh plugin --profile web add github:hemo94931/dsh-timeline

# 本地开发：在仓库根目录执行（安装为 link: 依赖，改 src/ 后 node build.js 重新构建即同步）
dsh plugin --profile web add .
```

包内的 `cordis.patch.yml`（经 package.json 的 `dsh.bundle.patch` 声明）会把 `ui-timeline` 行插入浏览器插件花名册，**下次启动 `dsh web` 自动加载**，无需任何手动激活。卸载：`dsh plugin --profile web remove @hemo94931/dsh-timeline`。

> 注意：`dsh plugin add` 需要系统装有 pnpm（`npm i -g pnpm`）。

### 临时激活（动态插件）

动态 Cordis 插件不随进程重启存活。在任意 dsh 会话中对 agent 说：

## 故障排查

- 启动报 `failed to apply loader entry ... (@hemo94931/dsh-timeline): styles is not defined`：常驻 bundle（`lib/client.js`）过期，缺静态环境的 `React`/`styles` prelude。`node build.js` 重新构建即可（详见 build.js 注释：静态 loader entry 没有动态插件闭包注入的符号）。
- 时间轴完全不出现：打开浏览器控制台看是否有 `[@hemo94931/dsh-timeline]` 警告（选择器漂移自检），或确认会话有 ≥2 条用户消息。
- 产品升级后失效：大概率是 `data-conversation-scroll` / `data-chat-flow-kind` / `data-chat-anchor-key` 选择器契约变化，更新 `src/shell.js` 顶部的 `SEL_*` 常量后重新 `node build.js`。
