// 时间轴纯逻辑模型单测 —— 覆盖 SPEC.md 的边界用例清单。
// 运行：node test/model.test.js（包为 type:module，ESM 直接执行）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tickCenterPx,
  tickHitHeight,
  truncateSummary,
  resolveCurrentPosition,
  resolveNav,
  shouldWarnMissingRows,
} from '../src/model.js'

test('tickCenterPx: 固定间距垂直居中聚集', () => {
  // count=2, track=600, maxSpacing=24 → cluster=48, start=276 → 中心 288 / 312
  assert.equal(tickCenterPx(0, 2, 600, 24), 288)
  assert.equal(tickCenterPx(1, 2, 600, 24), 312)
})

test('tickCenterPx: 消息过多时均匀压缩间距', () => {
  // count=200, track=600 → spacing=3, start=0 → 第 1 条中心 1.5，末条 598.5
  assert.equal(tickCenterPx(0, 200, 600, 24), 1.5)
  assert.equal(tickCenterPx(199, 200, 600, 24), 598.5)
})

test('tickCenterPx: 非法输入归 0', () => {
  assert.equal(tickCenterPx(0, 0, 600, 24), 0)
  assert.equal(tickCenterPx(5, 3, 600, 24), 0)
  assert.equal(tickCenterPx(0, 3, 0, 24), 0)
})

test('tickCenterPx: 接受分数下标（连续位置指示器复用同一公式）', () => {
  // count=2, track=600, maxSpacing=24 → start=276；0.25 → 276 + 0.75*24 = 294
  assert.equal(tickCenterPx(0.25, 2, 600, 24), 294)
  // count=3 → cluster=72, start=264；1.5 → 264 + 2*24 = 312
  assert.equal(tickCenterPx(1.5, 3, 600, 24), 312)
  // 整数下标语义不变：标记必须与刻度重合
  assert.equal(tickCenterPx(1, 3, 600, 24), 312 - 12)
})

test('tickCenterPx: 非有限下标归 0（不产生 NaN px）', () => {
  assert.equal(tickCenterPx(NaN, 3, 600, 24), 0)
  assert.equal(tickCenterPx(Infinity, 3, 600, 24), 0)
  assert.equal(tickCenterPx(-Infinity, 3, 600, 24), 0)
  assert.equal(tickCenterPx(-0.1, 3, 600, 24), 0)
})

test('tickHitHeight: 间距充足时取最小命中高度', () => {
  assert.equal(tickHitHeight(2, 600, 6, 24), 6)
})

test('tickHitHeight: 长会话时间距不足则占满间距（不重叠、不亚像素命中）', () => {
  assert.equal(tickHitHeight(200, 600, 6, 24), 3)
  assert.equal(tickHitHeight(1000, 600, 6, 24), 0.6)
})

test('tickHitHeight: 退化输入归 0', () => {
  assert.equal(tickHitHeight(0, 600, 6, 24), 0)
  assert.equal(tickHitHeight(5, 0, 6, 24), 0)
})

test('truncateSummary: 短文本原样返回', () => {
  assert.equal(truncateSummary('你好', 120), '你好')
  assert.equal(truncateSummary('a'.repeat(120), 120), 'a'.repeat(120))
})

test('truncateSummary: 超长截断并补省略号', () => {
  const out = truncateSummary('a'.repeat(121), 120)
  assert.equal(out, 'a'.repeat(120) + '…')
})

test('truncateSummary: 折叠连续空白与换行', () => {
  assert.equal(truncateSummary('第一行\n\n第二行   第三行\t结束', 120), '第一行 第二行 第三行 结束')
  assert.equal(truncateSummary('  前后空白  ', 120), '前后空白')
})

test('truncateSummary: 多字节字符按码点截断不破碎', () => {
  const text = '🙂'.repeat(130)
  const out = truncateSummary(text, 120)
  assert.equal(out, '🙂'.repeat(120) + '…')
  assert.equal(Array.from(out).length, 121)
})

test('truncateSummary: 空输入与 null', () => {
  assert.equal(truncateSummary('', 120), '')
  assert.equal(truncateSummary(null, 120), '')
})

test('resolveCurrentPosition: 视口顶在首条之上 → 兜底第 1 条位置', () => {
  assert.deepEqual(resolveCurrentPosition([100, 300, 500], 2), { pos: 0, lower: -1, fraction: 0 })
})

test('resolveCurrentPosition: 两条消息之间按滚动进度插值', () => {
  const r = resolveCurrentPosition([-100, 300], 0)
  assert.equal(r.lower, 0)
  assert.equal(r.fraction, 0.25)
  assert.equal(r.pos, 0.25)
})

test('resolveCurrentPosition: 视口顶恰在某条上 → 停在该刻度', () => {
  const r = resolveCurrentPosition([-100, 0, 300], 2)
  assert.equal(r.lower, 1)
  assert.ok(r.pos > 1 && r.pos < 1.01)
})

test('resolveCurrentPosition: 滚到底部命中末条位置', () => {
  assert.deepEqual(resolveCurrentPosition([-900, -500, -10], 2), { pos: 2, lower: 2, fraction: 1 })
})

test('resolveCurrentPosition: 空列表返回 -1', () => {
  assert.deepEqual(resolveCurrentPosition([], 2), { pos: -1, lower: -1, fraction: 0 })
})

test('resolveNav: 两条消息之间 → 上一条为下方邻、下一条为上方邻', () => {
  assert.deepEqual(resolveNav(0, 0.25, 3), { prev: 0, next: 1 })
})

test('resolveNav: 恰好停在某条顶部 → 上一条再退一步', () => {
  assert.deepEqual(resolveNav(1, 0, 3), { prev: 0, next: 2 })
})

test('resolveNav: 首条之上 → prev 置灰、next 指向首条', () => {
  assert.deepEqual(resolveNav(-1, 0, 3), { prev: null, next: 0 })
})

test('resolveNav: 首条顶部 → prev 置灰', () => {
  assert.deepEqual(resolveNav(0, 0, 3), { prev: null, next: 1 })
})

test('resolveNav: 越过末条 → next 置灰、prev 指向末条本身', () => {
  assert.deepEqual(resolveNav(2, 1, 3), { prev: 2, next: null })
})

test('resolveNav: 恰在末条顶部 → prev 指向倒数第二条', () => {
  assert.deepEqual(resolveNav(2, 0, 3), { prev: 1, next: null })
})

test('resolveNav: 仅 2 条时相互跳转', () => {
  assert.deepEqual(resolveNav(0, 0, 2), { prev: null, next: 1 })
  assert.deepEqual(resolveNav(1, 0, 2), { prev: 0, next: null })
  assert.deepEqual(resolveNav(1, 1, 2), { prev: 1, next: null })
})

test('resolveNav: 空列表双侧置灰', () => {
  assert.deepEqual(resolveNav(-1, 0, 0), { prev: null, next: null })
})

test('shouldWarnMissingRows: 内容长却零用户行才告警', () => {
  assert.equal(shouldWarnMissingRows(0, 1000, 400), true)
  assert.equal(shouldWarnMissingRows(3, 1000, 400), false)
})

test('shouldWarnMissingRows: 严格大于 2 倍视口高才告警', () => {
  assert.equal(shouldWarnMissingRows(0, 800, 400), false)
  assert.equal(shouldWarnMissingRows(0, 801, 400), true)
})

test('shouldWarnMissingRows: 退化与非有限输入不告警', () => {
  assert.equal(shouldWarnMissingRows(0, 1000, 0), false)
  assert.equal(shouldWarnMissingRows(0, 0, 400), false)
  assert.equal(shouldWarnMissingRows(0, NaN, 400), false)
  assert.equal(shouldWarnMissingRows(0, 1000, NaN), false)
  assert.equal(shouldWarnMissingRows(0, Infinity, 400), false)
})
