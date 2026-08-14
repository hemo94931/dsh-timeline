// 冒烟测试：模拟浏览器 __ModuleLoader__ 环境执行 lib/client.js 的 factory，
// 验证静态 loader entry 路径下不再出现 free-variable ReferenceError（styles / React）。
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const code = fs.readFileSync(path.join(root, '..', 'lib', 'client.js'), 'utf8')

const appended = []
const removed = []
const fakeTag = () => ({
  dataset: {},
  textContent: '',
  remove() { removed.push(this) },
})
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(entry) { sandbox.__entry = entry },
    },
  },
  document: {
    querySelector() { return null },
    createElement() { return fakeTag() },
    head: { appendChild(tag) { appended.push(tag) } },
  },
}
vm.createContext(sandbox)
vm.runInContext(code, sandbox)

const entry = sandbox.__entry
if (!entry || entry.id !== '@hemo94931/dsh-timeline') throw new Error('loader entry 未注册或 id 错误')

const reactStub = {
  createElement: () => null,
  useState: () => [null, () => {}],
  useRef: () => ({ current: null }),
  useEffect: () => {},
}
const exports_ = entry.factory((name) => {
  if (name === 'react') return reactStub
  throw new Error('unexpected require: ' + name)
})
if (typeof exports_.apply !== 'function') throw new Error('缺少 exports.apply')
if (!Array.isArray(exports_.inject) || exports_.inject[0] !== 'timer') throw new Error('exports.inject 错误')

// 触发 apply 的 styles.insert 分支：slots 存在即可
const fakeCtx = {
  get(name) {
    if (name === 'slots') {
      return { inject: () => {}, register: () => () => {} }
    }
    return undefined
  },
}
exports_.apply(fakeCtx)
if (appended.length !== 1) throw new Error('styles.insert 未插入 style 标签')
if (!appended[0].textContent.includes('dsh-tl-flash')) throw new Error('style 内容不对')
if (appended[0].dataset.plugin !== '@hemo94931/dsh-timeline') throw new Error('style 未标记插件名')

// slots 缺失时 apply 应安静返回（不触碰 styles）
exports_.apply({ get: () => undefined })

console.log('smoke ok: factory 注册、exports.apply/inject 形状、styles shim、React require 全部通过')
