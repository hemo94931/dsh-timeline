/**
 * 会话时间轴插件，node half。纯 UI 插件：空的 apply 是为了让插件出现在
 * 宿主 Loader 中；浏览器半部分经 exports["./client"] 分发，
 * 由 package.json 的 dsh.client 声明被发现。
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}

export { apply };
