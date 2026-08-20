// 时间轴 DOM 薄壳 + React 视图 —— 依赖 build.js 内联在上方 model 函数（tickCenterPx 等）
// 与 timelineDom 命名空间（src/dom.js，产品 DOM 契约持有者）。
// controller 经参数注入的 dom adapter 访问产品 DOM，自身不再持有选择器。
// 本文件 + 模型拼接后即为动态 Cordis 客户端插件的完整函数体（见 client.js）。

var STRIP_WIDTH = 20
var MIN_HIT = 6
var TICK_SPACING = 24
var SUMMARY_MAX = 120
var FLASH_MS = 1600

function createTimelineController(ctx, dom, notify) {
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
    // 三态判定：open / unknown 都视为"非收起"→ 时间轴隐藏（unknown 保守处理，:no-frame 告警由 adapter 负责）
    detailsOpen = dom.detailsState(scroller) !== 'closed'
  }

  function refreshTicks() {
    if (!scroller) return
    ticks = dom.readTicks(scroller)
    refreshGeometry()
    updateCurrent()
    emit()
  }

  function rowOf(tick) {
    return dom.rowOf(scroller, tick.key)
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
    // 换了滚动容器（会话切换）：重置漂移告警，让新容器的契约状态可被重新报告
    dom.resetWarnings()
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
    var found = dom.findScroller()
    if (found !== scroller) bind(found)
  }, 400)

  bind(dom.findScroller())

  return {
    jumpTo: function (index) {
      if (!scroller || index < 0 || index >= ticks.length) return
      var row = rowOf(ticks[index])
      if (!row) return
      scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      // 闪动高亮目标由 DOM adapter 决定（气泡优先，缺失回退整行；不持有产品选择器）
      var target = dom.flashTargetOf(row)
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
  // （分数下标复用 tickCenterPx 同一公式，保证标记与刻度严格对齐）
  if (state.currentPos >= 0 && n > 0 && trackHeight > 0) {
    var markerY = tickCenterPx(state.currentPos, n, trackHeight, TICK_SPACING)
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

return {
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
        var ctl = createTimelineController(ctx, timelineDom, function (s) { setState(s) })
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
