// 由 build.js 生成，请勿手改；源文件在 src/，构建逻辑见 build.js
window.__ModuleLoader__.load({
	id: "@hemo94931/dsh-timeline",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");
		var styles = {
			insert: function (css) {
				var tagId = "@hemo94931/dsh-timeline";
				var old = document.querySelector("style[data-plugin=" + JSON.stringify(tagId) + "]");
				if (old) old.remove();
				var tag = document.createElement("style");
				tag.dataset.plugin = tagId;
				tag.textContent = css;
				document.head.appendChild(tag);
				return function () { tag.remove(); };
			},
		};
// dsh 会话时间轴插件 —— 客户端 half（由 build.js 生成，请勿手改；改 src/ 后重新构建）
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

// 时间轴 DOM 薄壳 —— 依赖 build.js 内联在上方模型函数（tickCenterRatio 等）。
// 本文件 + 模型拼接后即为动态 Cordis 客户端插件的完整函数体（见 client.js）。

var STRIP_WIDTH = 20
var MIN_HIT = 6
var TICK_SPACING = 24
var SUMMARY_MAX = 120
var FLASH_MS = 1600
var SEL_SCROLLER = '[data-conversation-scroll]'
var SEL_USER_ROWS = '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]'

var cssEscape = (typeof CSS !== 'undefined' && CSS.escape)
  ? function (s) { return CSS.escape(s) }
  : function (s) { return String(s).replace(/["\\]/g, '\\$&') }

function findScroller() {
  return document.querySelector(SEL_SCROLLER)
}

function extractText(row) {
  var bubble = row.querySelector('[class*="_bubble"]')
  var t = bubble ? bubble.innerText : row.innerText
  return t == null ? '' : t
}

// 详情面板检测：沿滚动容器向上找三列 grid 框架，第三列（details）宽度 > 1px 视为打开。
function detectDetailsOpen(scroller) {
  var el = scroller
  while (el) {
    var cs = getComputedStyle(el)
    if (cs.display === 'grid') {
      var parts = cs.gridTemplateColumns.split(' ').filter(Boolean)
      if (parts.length === 3) return parseFloat(parts[2]) > 1
    }
    el = el.parentElement
  }
  return false
}

function createTimelineController(ctx, notify) {
  var disposed = false
  var scroller = null
  var mo = null
  var ro = null
  var onScroll = null
  var ticks = []
  var currentPos = -1
  var navPrev = null
  var navNext = null
  var hoveredIndex = -1
  var detailsOpen = false
  var rect = null
  var flashEl = null
  var warnedDrift = false

  function computeVisible() {
    return scroller !== null && ticks.length >= 2 && !detailsOpen
  }

  function emit() {
    if (disposed) return
    notify({
      visible: computeVisible(),
      ticks: ticks,
      currentPos: currentPos,
      navPrev: navPrev,
      navNext: navNext,
      hoveredIndex: hoveredIndex,
      rect: rect,
    })
  }

  function refreshGeometry() {
    if (!scroller) { rect = null; detailsOpen = false; return }
    var r = scroller.getBoundingClientRect()
    rect = { top: r.top, left: r.right - STRIP_WIDTH, height: r.height, width: STRIP_WIDTH }
    detailsOpen = detectDetailsOpen(scroller)
  }

  function refreshTicks() {
    if (!scroller) return
    var rows = scroller.querySelectorAll(SEL_USER_ROWS)
    if (rows.length === 0 && scroller.scrollHeight > scroller.clientHeight * 2 && !warnedDrift) {
      warnedDrift = true
      console.error('[dsh-timeline] 用户消息选择器命中 0 行但页面内容很长：产品 DOM 可能已变化，时间轴降级隐藏')
    }
    var next = []
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].getAttribute('data-chat-anchor-key')
      if (key) next.push({ key: key, text: extractText(rows[i]) })
    }
    ticks = next
    refreshGeometry()
    updateCurrent()
    emit()
  }

  function rowOf(tick) {
    return scroller ? scroller.querySelector('[data-chat-anchor-key="' + cssEscape(tick.key) + '"]') : null
  }

  function updateCurrent() {
    if (!scroller || ticks.length === 0) { currentPos = -1; navPrev = null; navNext = null; return }
    var sTop = scroller.getBoundingClientRect().top
    var tops = []
    for (var i = 0; i < ticks.length; i++) {
      var row = rowOf(ticks[i])
      tops.push(row ? row.getBoundingClientRect().top - sTop : Infinity)
    }
    var cur = resolveCurrentPosition(tops, 2)
    currentPos = cur.pos
    var nav = resolveNav(cur.lower, cur.fraction, ticks.length)
    navPrev = nav.prev
    navNext = nav.next
  }

  var debouncedRefresh = ctx.debounce(refreshTicks, 150)

  function unbind() {
    if (mo) { mo.disconnect(); mo = null }
    if (ro) { ro.disconnect(); ro = null }
    if (scroller && onScroll) scroller.removeEventListener('scroll', onScroll)
    onScroll = null
    scroller = null
  }

  function bind(next) {
    unbind()
    scroller = next
    if (!scroller) {
      ticks = []; currentPos = -1; navPrev = null; navNext = null; hoveredIndex = -1; rect = null; detailsOpen = false
      emit()
      return
    }
    mo = new MutationObserver(debouncedRefresh)
    mo.observe(scroller, { childList: true, subtree: true, characterData: true })
    ro = new ResizeObserver(function () { refreshGeometry(); updateCurrent(); emit() })
    ro.observe(scroller)
    onScroll = ctx.throttle(function () { updateCurrent(); emit() }, 100)
    scroller.addEventListener('scroll', onScroll, { passive: true })
    refreshTicks()
  }

  // 会话切换 / hero 页进出：周期性检查滚动容器元素身份，变化时整体重绑定。
  var disposeInterval = ctx.interval(function () {
    var found = findScroller()
    if (found !== scroller) bind(found)
  }, 400)

  bind(findScroller())

  return {
    jumpTo: function (index) {
      if (!scroller || index < 0 || index >= ticks.length) return
      var row = rowOf(ticks[index])
      if (!row) return
      scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      // 闪动高亮只作用于消息气泡本身，而不是整行（整行会让高亮区域超出消息框）
      var target = row.querySelector('[class*="_bubble"]') || row
      if (flashEl) flashEl.classList.remove('dsh-tl-flash')
      flashEl = target
      target.classList.add('dsh-tl-flash')
      ctx.timeout(function () {
        target.classList.remove('dsh-tl-flash')
        if (flashEl === target) flashEl = null
      }, FLASH_MS)
      currentPos = index
      var nav = resolveNav(index, 0, ticks.length)
      navPrev = nav.prev
      navNext = nav.next
      emit()
    },
    goPrev: function () {
      if (navPrev !== null) this.jumpTo(navPrev)
    },
    goNext: function () {
      if (navNext !== null) this.jumpTo(navNext)
    },
    setHovered: function (index) {
      if (hoveredIndex === index) return
      hoveredIndex = index
      emit()
    },
    dispose: function () {
      disposed = true
      disposeInterval()
      debouncedRefresh.dispose()
      if (onScroll) onScroll.dispose()
      unbind()
      if (flashEl) { flashEl.classList.remove('dsh-tl-flash'); flashEl = null }
    },
  }
}

function TimelineStrip(props) {
  var state = props.state
  var ctl = props.controllerRef.current
  if (!state.visible || !state.rect) return null

  var ticks = state.ticks
  var n = ticks.length
  var rect = state.rect
  // ▲ + 刻度簇 + ▼ 作为整体垂直居中，箭头紧贴刻度簇两端
  var ARROW_H = 20
  var ARROW_GAP = 2
  var availTrack = Math.max(rect.height - 2 * (ARROW_H + ARROW_GAP), 0)
  var trackHeight = Math.min(n * TICK_SPACING, availTrack)
  var wrapTop = Math.max((rect.height - trackHeight - 2 * (ARROW_H + ARROW_GAP)) / 2, 0)
  var hit = tickHitHeight(n, trackHeight, MIN_HIT, TICK_SPACING)
  var nav = { prev: state.navPrev, next: state.navNext }

  var children = []

  function navButton(label, symbol, target, pos) {
    return React.createElement('button', {
      key: symbol,
      type: 'button',
      'aria-label': label,
      disabled: target === null,
      onClick: function () { var c = props.controllerRef.current; if (c) target === 'prev' ? c.goPrev() : c.goNext() },
      style: {
        pointerEvents: 'auto',
        position: 'absolute', left: 0, width: STRIP_WIDTH - 4, height: 20, lineHeight: '20px',
        top: pos === 'top' ? 0 : undefined, bottom: pos === 'bottom' ? 0 : undefined,
        border: 'none', padding: 0, margin: 0, background: 'transparent',
        color: target === null ? 'var(--dsw-alias-border-l1)' : 'var(--dsw-alias-label-secondary)',
        cursor: target === null ? 'default' : 'pointer',
        fontSize: 10, textAlign: 'center',
      },
    }, symbol)
  }

  children.push(navButton('上一条用户消息', '▲', nav.prev === null ? null : 'prev', 'top'))
  children.push(navButton('下一条用户消息', '▼', nav.next === null ? null : 'next', 'bottom'))

  var trackChildren = []
  for (var i = 0; i < n; i++) {
    ;(function (index) {
      var isHovered = index === state.hoveredIndex
      var lineWidth = isHovered ? 16 : 12
      var color = isHovered ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-border-l2)'
      trackChildren.push(React.createElement('button', {
        key: ticks[index].key,
        type: 'button',
        className: 'dsh-tl-tick',
        'aria-label': '第 ' + (index + 1) + ' 条，共 ' + n + ' 条用户消息',
        onClick: function () { var c = props.controllerRef.current; if (c) c.jumpTo(index) },
        onMouseEnter: function () { var c = props.controllerRef.current; if (c) c.setHovered(index) },
        onMouseLeave: function () { var c = props.controllerRef.current; if (c) c.setHovered(-1) },
        style: {
          pointerEvents: 'auto',
          position: 'absolute',
          top: (tickCenterPx(index, n, trackHeight, TICK_SPACING) - hit / 2) + 'px',
          left: 0, width: STRIP_WIDTH - 4, height: Math.max(hit, 1),
          border: 'none', padding: 0, margin: 0, background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      }, React.createElement('span', {
        style: { display: 'block', width: lineWidth, height: 2, borderRadius: 1, background: color },
      })))
    })(i)
  }

  // 连续位置指示器：视口顶在两条用户消息之间时，按滚动进度插值位于两条刻度之间
  if (state.currentPos >= 0 && n > 0 && trackHeight > 0) {
    var spacing = Math.min(TICK_SPACING, trackHeight / n)
    var start = (trackHeight - spacing * n) / 2
    var markerY = start + (state.currentPos + 0.5) * spacing
    trackChildren.push(React.createElement('div', {
      key: 'dsh-tl-current',
      className: 'dsh-tl-current',
      style: {
        position: 'absolute',
        top: markerY - 1,
        left: 0, width: STRIP_WIDTH - 4,
        display: 'flex', justifyContent: 'center',
        transition: 'top 80ms linear',
        pointerEvents: 'none',
      },
    }, React.createElement('span', {
      style: { display: 'block', width: 16, height: 2, borderRadius: 1, background: 'var(--dsw-alias-brand-primary)' },
    })))
  }

  children.push(React.createElement('div', {
    key: 'track',
    style: { position: 'absolute', top: ARROW_H + ARROW_GAP, height: trackHeight, left: 0, right: 0 },
  }, trackChildren))

  if (state.hoveredIndex >= 0 && state.hoveredIndex < n) {
    var tipTop = rect.top + wrapTop + ARROW_H + ARROW_GAP + tickCenterPx(state.hoveredIndex, n, trackHeight, TICK_SPACING)
    children.push(React.createElement('div', {
      key: 'tooltip',
      style: {
        position: 'fixed',
        // 用 right 锚定（相对视口右缘），让信息框向左自由展开；
        // 之前用 left + translate(-100%) 会被右缘挤压成竖排文字
        right: (window.innerWidth - rect.left + 10) + 'px',
        top: tipTop,
        transform: 'translateY(-50%)',
        width: 'max-content',
        maxWidth: 320,
        pointerEvents: 'none',
        background: 'var(--dsw-alias-bg-overlay)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        padding: '8px 10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        zIndex: 30,
      },
    },
      React.createElement('div', {
        style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, marginBottom: 4 },
      }, (state.hoveredIndex + 1) + ' / ' + n),
      truncateSummary(ticks[state.hoveredIndex].text, SUMMARY_MAX) || '（空消息）'))
  }

  var wrapper = React.createElement('div', {
    style: {
      position: 'absolute',
      top: wrapTop, left: 0, right: 0,
      height: trackHeight + 2 * (ARROW_H + ARROW_GAP),
    },
  }, children)

  return React.createElement('div', {
    className: 'dsh-tl-root',
    style: {
      position: 'fixed',
      top: rect.top, left: rect.left, width: rect.width, height: rect.height,
      pointerEvents: 'none',
      zIndex: 21,
    },
  }, [wrapper])
}

var __plugin = {
  inject: ['timer'],
  apply(ctx) {
    var slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert(
      '@keyframes dsh-tl-flash-bg {' +
      '  0% { background-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent); }' +
      '  100% { background-color: transparent; }' +
      '}' +
      '.dsh-tl-flash { animation: dsh-tl-flash-bg ' + FLASH_MS + 'ms ease-out; }'
    )

    function TimelineView() {
      var pair = React.useState(null)
      var state = pair[0]
      var setState = pair[1]
      var ref = React.useRef(null)
      React.useEffect(function () {
        var ctl = createTimelineController(ctx, function (s) { setState(s) })
        ref.current = ctl
        return function () { ctl.dispose(); ref.current = null }
      }, [])
      if (state === null) return null
      return React.createElement(TimelineStrip, { state: state, controllerRef: ref })
    }

    slots.inject('shell.overlay', function () {
      return slots.register(
        { name: 'shell.overlay', id: 'dsh-session-timeline', label: '会话时间轴' },
        function () { return React.createElement(TimelineView) },
      )
    })
  },
}

exports.apply = __plugin.apply;
exports.inject = __plugin.inject;

		return module.exports;
	}
});
