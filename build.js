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

const modelRaw = fs.readFileSync(path.join(root, 'src', 'model.js'), 'utf8')
const marker = '// __EXPORTS__'
const markerAt = modelRaw.indexOf(marker)
if (markerAt === -1) throw new Error('src/model.js 缺少 // __EXPORTS__ 标记')
const model = modelRaw.slice(0, markerAt).trimEnd()
const shell = fs.readFileSync(path.join(root, 'src', 'shell.js'), 'utf8').trim()

// ── 1. 动态插件函数体 ──────────────────────────────────────────────
const dynamicBody = [
  '// dsh 会话时间轴插件 —— 客户端 half（由 build.js 生成，请勿手改；改 src/ 后重新构建）',
  model,
  '',
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

console.log('built client.js (' + dynamicBody.length + ' chars) and lib/client.js (' + bundle.length + ' chars)')
