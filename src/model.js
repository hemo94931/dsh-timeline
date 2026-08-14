// 时间轴纯逻辑模型 —— 不依赖 DOM，可单测。
// 该文件由 build.js 内联进 client.js（截取导出标记之前的部分），
// 同时以 CommonJS 导出供 node:test 使用。修改后需运行 `node build.js` 重新构建。

/**
 * 第 index 条刻度中心在轨道内的像素位置。
 * 固定间距（≤ maxSpacing）垂直居中聚集；消息过多时均匀压缩间距（不设下限、不合并）。
 */
function tickCenterPx(index, count, trackHeight, maxSpacing) {
  if (count <= 0 || trackHeight <= 0 || index < 0 || index >= count) return 0
  const spacing = Math.min(maxSpacing, trackHeight / count)
  const cluster = spacing * count
  const start = (trackHeight - cluster) / 2
  return start + (index + 0.5) * spacing
}

/**
 * 每条刻度的命中区域高度（px）。
 * 命中区域最小 minHit px；间距不足时占满间距（不重叠、不亚像素命中）。
 */
function tickHitHeight(count, trackHeight, minHit, maxSpacing) {
  if (count <= 0 || trackHeight <= 0) return 0
  const spacing = Math.min(maxSpacing, trackHeight / count)
  return Math.min(minHit, spacing)
}

/**
 * 消息摘要截断：折叠连续空白为单个空格，按 Unicode 码点截断到 maxChars，超出补省略号。
 */
function truncateSummary(text, maxChars) {
  const collapsed = String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
  const chars = Array.from(collapsed)
  if (chars.length <= maxChars) return collapsed
  return chars.slice(0, maxChars).join('') + '…'
}

/**
 * 当前位置解析（连续插值）。
 * rowTops: 各用户消息行相对滚动容器视口顶部的偏移（px，可为负）。
 * 返回 { pos, lower, fraction }：
 *  - pos：0 ~ n-1 的连续刻度坐标，视口顶在两条消息之间时按滚动进度插值；
 *  - lower：视口顶之上最近一条的下标（无则 -1）；
 *  - fraction：lower 与 lower+1 之间的进度（0~1）。
 * 空列表返回 { pos: -1, lower: -1, fraction: 0 }。
 */
function resolveCurrentPosition(rowTops, tolerance) {
  const n = rowTops.length
  const tol = tolerance == null ? 0 : tolerance
  if (n === 0) return { pos: -1, lower: -1, fraction: 0 }
  if (rowTops[0] > tol) return { pos: 0, lower: -1, fraction: 0 }
  for (let i = 0; i < n - 1; i++) {
    if (rowTops[i] <= tol && rowTops[i + 1] > tol) {
      const span = rowTops[i + 1] - rowTops[i]
      const f = span > 0 ? (tol - rowTops[i]) / span : 0
      const clamped = Math.min(Math.max(f, 0), 1)
      return { pos: i + clamped, lower: i, fraction: clamped }
    }
  }
  return { pos: n - 1, lower: n - 1, fraction: 1 }
}

/**
 * 上一条/下一条解析（基于连续位置）。
 * 规则：位于两条消息之间时，上一条 = lower（视口顶之上那条），下一条 = lower + 1；
 * 恰好停在某条顶部（fraction ≈ 0）时，上一条 = lower - 1；
 * 在首条之上时 prev 为 null、next = 0；越过末条时 next 为 null。
 * 越界侧为 null（对应按钮置灰禁用）。
 */
function resolveNav(lower, fraction, count) {
  if (count <= 0) return { prev: null, next: null }
  const atMsg = fraction < 0.02
  let prev
  if (lower === -1) prev = null
  else prev = atMsg ? lower - 1 : lower
  if (prev !== null && prev < 0) prev = null
  let next = lower + 1
  if (next > count - 1) next = null
  return { prev, next }
}

// __EXPORTS__
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tickCenterPx,
    tickHitHeight,
    truncateSummary,
    resolveCurrentPosition,
    resolveNav,
  }
}
export { tickCenterPx, tickHitHeight, truncateSummary, resolveCurrentPosition, resolveNav }
