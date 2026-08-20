// 构建脚本（ESM）：
//  1. client.js      —— 动态 Cordis 客户端插件函数体（model + shell 拼接），供 cordis_define 使用
//  2. lib/client.js  —— 同一逻辑的 lazy-CJS bundle 包装（window.__ModuleLoader__.load），
//                      供 `dsh plugin --profile web add` 安装为常驻插件后由 /plugins 分发
// 用法：node build.js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

// 源文件读取（缺失给出明确报错而不是 ENOENT 堆栈）
function readSrc(name) {
  const file = path.join(root, 'src', name)
  if (!fs.existsSync(file)) throw new Error(`缺少源文件 ${file}`)
  return fs.readFileSync(file, 'utf8')
}

const modelRaw = readSrc('model.js')
const marker = '// __EXPORTS__'
const markerAt = modelRaw.indexOf(marker)
if (markerAt === -1) throw new Error('src/model.js 缺少 // __EXPORTS__ 标记')
const model = modelRaw.slice(0, markerAt).trimEnd()
const dom = readSrc('dom.js').trim()
const shell = readSrc('shell.js').trim()

// 轻量拼接断言：三段各自必须贡献的关键符号（缺失 = 源文件被改坏，构建期报错）
if (!/(?:^|\n)var timelineDom\b/.test(dom)) throw new Error('src/dom.js 必须定义顶层 var timelineDom（IIFE 命名空间）')
if (!/(?:^|\n)function createTimelineController\b/.test(shell)) throw new Error('src/shell.js 必须定义顶层 function createTimelineController')

// ── 1. 动态插件函数体 ──────────────────────────────────────────────
// 拼接顺序：model（纯逻辑）→ dom（产品 DOM 契约 adapter）→ shell（controller + 视图 + 挂载）。
// 各段以来源注释分隔，运行环境注入的符号仅 React/styles/ctx（见各段头部说明）。
const dynamicBody = [
  '// dsh 会话时间轴插件 —— 客户端 half（由 build.js 生成，请勿手改；改 src/ 后重新构建）',
  '// ═══ src/model.js（纯逻辑模型，截取导出标记之前）═══',
  model,
  '',
  '// ═══ src/dom.js（产品 DOM 契约 adapter，暴露 timelineDom 命名空间）═══',
  dom,
  '',
  '// ═══ src/shell.js（controller + React 视图 + Cordis 挂载）═══',
  shell,
  '',
].join('\n')
fs.writeFileSync(path.join(root, 'client.js'), dynamicBody)

// ── 2. lazy-CJS bundle（常驻安装用）────────────────────────────────
// 把函数体末尾的顶层 `return { ... }` 改写为 exports.apply / exports.inject。
const retMarker = '\nreturn {'
const retAt = dynamicBody.lastIndexOf(retMarker)
if (retAt === -1) throw new Error('函数体末尾缺少顶层 return {')
const factoryBody =
  dynamicBody.slice(0, retAt) +
  '\nvar __plugin = {' +
  dynamicBody.slice(retAt + retMarker.length) +
  '\nexports.apply = __plugin.apply;\nexports.inject = __plugin.inject;\n'

// 静态 loader entry 没有动态插件闭包注入的 React / styles 符号：
//  - React 走 __ModuleLoader__ 的 CJS require（与官方 client-ui 包一致）；
//  - styles 换成最小 shim：直接插 <style> 标签（按插件名去重，HMR 重放安全），
//    返回的 disposer 可用于提前移除。
const factoryPrelude = [
  '\t\tvar React = require("react");',
  '\t\tvar styles = {',
  '\t\t\tinsert: function (css) {',
  '\t\t\t\tvar tagId = ' + JSON.stringify(pkg.name) + ';',
  '\t\t\t\tvar old = document.querySelector("style[data-plugin=" + JSON.stringify(tagId) + "]");',
  '\t\t\t\tif (old) old.remove();',
  '\t\t\t\tvar tag = document.createElement("style");',
  '\t\t\t\ttag.dataset.plugin = tagId;',
  '\t\t\t\ttag.textContent = css;',
  '\t\t\t\tdocument.head.appendChild(tag);',
  '\t\t\t\treturn function () { tag.remove(); };',
  '\t\t\t},',
  '\t\t};',
].join('\n')

const bundle = [
  '// 由 build.js 生成，请勿手改；源文件在 src/，构建逻辑见 build.js',
  'window.__ModuleLoader__.load({',
  '\tid: ' + JSON.stringify(pkg.name) + ',',
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  factoryPrelude,
  factoryBody,
  '\t\treturn module.exports;',
  '\t}',
  '});',
  '',
].join('\n')
fs.mkdirSync(path.join(root, 'lib'), { recursive: true })
fs.writeFileSync(path.join(root, 'lib', 'client.js'), bundle)

// ── 3. 零依赖产物校验 ─────────────────────────────────────────────
// 两个产物由同一段 dynamicBody 派生，但符号环境不同（动态：宿主闭包注入；常驻：prelude）。
// 此处只断言结构与嵌入关系，运行行为靠烟测。
if (/^\s*(import|export)\b/m.test(dynamicBody)) {
  throw new Error('动态函数体含模块语法（import/export）：拼接源文件不得使用模块语法')
}
for (const [label, file] of [['client.js', 'client.js'], ['lib/client.js', path.join('lib', 'client.js')]]) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  if (!text.includes('var timelineDom')) throw new Error(`${label} 缺少 timelineDom：dom 段未嵌入`)
  if (!text.includes('function createTimelineController')) throw new Error(`${label} 缺少 createTimelineController：shell 段未嵌入`)
}
const resident = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
if (!resident.includes('exports.apply = __plugin.apply')) throw new Error('lib/client.js 顶层 return 改写缺失：retMarker 未命中末尾 return')
if ((resident.match(/window\.__ModuleLoader__\.load\(/g) || []).length !== 1) throw new Error('lib/client.js loader 包装异常')

// 编译期烟测（只编译不执行）：拼接体的语法错误在构建时即失败，而非等到浏览器加载。
// 边界：仅覆盖语法层——环境符号拼写（React/styles/ctx 之外的闭包符号）仍只能靠运行期暴露。
new Function('React', 'styles', 'ctx', dynamicBody)
new Function(bundle)

console.log('built client.js (' + dynamicBody.length + ' chars) and lib/client.js (' + bundle.length + ' chars)')
