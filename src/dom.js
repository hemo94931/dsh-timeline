// 产品 DOM 契约持有者 —— 时间轴对 dsh WebUI 页面结构的全部事实集中于此（CONTEXT.md：产品 DOM 契约）。
// 本文件由 build.js 内联进 client.js（拼接顺序 model → dom → shell），
// 因此可使用上方 model.js 内联的 shouldWarnMissingRows 谓词；不得使用 import/export。
//
// 契约语义（对照产品 0.1.0-rc.7 核实，0.1.1-rc.1 复核无漂移）：
//  - 滚动容器：[data-conversation-scroll]
//  - 用户消息行：[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]（两者同等对待）
//  - 锚点：data-chat-anchor-key —— 非空、会话内稳定，作为刻度身份与行定位 key
//  - 气泡：[class*="_bubble"] —— 可选；摘要文本与跳转闪动优先作用于气泡，缺失时回退整行
//  - 详情面板：frame 元素上的 data-details-collapsed 为 presence 语义（属性存在 = 收起，
//    与产品 CSS `.frame[data-details-collapsed]` 一致，不解析属性值）；frame 的定位
//    沿用三列 grid 走查（仅用于定位 frame，不再用列宽判断开合）
//
// 产品升级后时间轴异常：优先核对本文件。漂移自检标签统一为 [dsh-timeline:dom]，
// 每契约每个滚动容器生命周期最多告警一次，controller 重绑定时调用 resetWarnings() 重置。
var timelineDom = (function () {
  var SEL_SCROLLER = '[data-conversation-scroll]'
  var SEL_USER_ROWS = '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]'
  var SEL_BUBBLE = '[class*="_bubble"]'
  var ATTR_DETAILS_COLLAPSED = 'data-details-collapsed'

  var warned = {}

  function warnOnce(kind, message, isError) {
    if (warned[kind]) return
    warned[kind] = true
    if (isError) console.error(message)
    else console.warn(message)
  }

  var cssEscape = (typeof CSS !== 'undefined' && CSS.escape)
    ? function (s) { return CSS.escape(s) }
    : function (s) { return String(s).replace(/["\\]/g, '\\$&') }

  function findScroller() {
    return document.querySelector(SEL_SCROLLER)
  }

  function readTicks(scroller) {
    var rows = scroller.querySelectorAll(SEL_USER_ROWS)
    if (shouldWarnMissingRows(rows.length, scroller.scrollHeight, scroller.clientHeight)) {
      warnOnce('rows0', '[dsh-timeline:dom] rows=0 用户消息选择器命中 0 行但页面内容很长：产品 DOM 可能已变化，时间轴降级隐藏', true)
    }
    var next = []
    var missingBubble = 0
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].getAttribute('data-chat-anchor-key')
      if (!key) continue
      var bubble = rows[i].querySelector(SEL_BUBBLE)
      if (!bubble) missingBubble++
      var text = bubble ? bubble.innerText : rows[i].innerText
      next.push({ key: key, text: text == null ? '' : text })
    }
    if (missingBubble > 0) {
      warnOnce('noBubble', '[dsh-timeline:dom] no-bubble rows=' + rows.length + ' missing=' + missingBubble + '：气泡选择器可能已漂移，摘要/闪动回退整行')
    }
    return next
  }

  function rowOf(scroller, key) {
    return scroller.querySelector('[data-chat-anchor-key="' + cssEscape(key) + '"]')
  }

  function flashTargetOf(row) {
    return row.querySelector(SEL_BUBBLE) || row
  }

  // 详情面板三态：'open' | 'closed' | 'unknown'。
  // 逐层向上：先查 data-details-collapsed（presence = frame 已收起详情），
  // 再查三列 grid 形状（= 找到 frame 且无该属性 → 打开）；走到根都没见到 → unknown。
  // unknown 不与 open 混同：显示侧保守处理（隐藏），诊断侧保留 :no-frame 信号。
  function detailsState(scroller) {
    var el = scroller
    while (el) {
      if (el.hasAttribute && el.hasAttribute(ATTR_DETAILS_COLLAPSED)) {
        warned.noFrame = false // 确定性命中：清掉可能被瞬态 unknown 烧掉的 no-frame 旗标
        return 'closed'
      }
      var cs = getComputedStyle(el)
      if (cs.display === 'grid') {
        var parts = cs.gridTemplateColumns.split(' ').filter(Boolean)
        if (parts.length === 3) {
          warned.noFrame = false
          return 'open'
        }
      }
      el = el.parentElement
    }
    warnOnce('noFrame', '[dsh-timeline:dom] no-frame 沿滚动容器向上未找到详情 frame（既无 data-details-collapsed 也非三列 grid）：产品布局可能已变化，时间轴保守隐藏')
    return 'unknown'
  }

  function resetWarnings() {
    warned = {}
  }

  return {
    findScroller: findScroller,
    readTicks: readTicks,
    rowOf: rowOf,
    flashTargetOf: flashTargetOf,
    detailsState: detailsState,
    resetWarnings: resetWarnings,
  }
})()
