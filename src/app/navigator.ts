import { reactive, readonly, computed, type DeepReadonly } from 'vue'

export type ScreenId = 'title' | 'game' | 'saves' | 'settings' | 'backlog'
export interface NavigationHooks {
  onBeforeLeave?: (from: ScreenId, to: ScreenId) => boolean | Promise<boolean>
  onAfterEnter?: (from: ScreenId, to: ScreenId) => void
}

export interface NavigatorState {
  /** 当前显示的画面 */
  readonly current: ScreenId
  readonly stack: readonly ScreenId[]
  /** Game 画面是否曾被激活 */
  readonly gameActivated: boolean
}

const state = reactive({
  current: 'title' as ScreenId,
  stack: [] as ScreenId[],
  gameActivated: false,
})

const hooks: NavigationHooks[] = []
const canGoBack = computed(() => state.stack.length > 0)
const isInGame = computed(() => state.current === 'game')
async function fireBeforeLeave(from: ScreenId, to: ScreenId): Promise<boolean> {
  const results = await Promise.all(
    hooks.map((h) => h.onBeforeLeave?.(from, to) ?? true),
  )
  return results.every(Boolean)
}

function fireAfterEnter(from: ScreenId, to: ScreenId): void {
  hooks.forEach((h) => h.onAfterEnter?.(from, to))
}

/**
 * 切换到目标画面，将当前画面压入导航栈。
 *
 * @returns 是否切换成功（hooks 可阻止）
 */
async function navigateTo(screen: ScreenId): Promise<boolean> {
  if (screen === state.current) return true

  const from = state.current
  if (!(await fireBeforeLeave(from, screen))) return false

  state.stack.push(from)
  state.current = screen

  if (screen === 'game') {
    state.gameActivated = true
  }

  fireAfterEnter(from, screen)
  return true
}

/**
 * 返回上一个画面（从导航栈弹出）。
 * 栈为空时不做任何操作。
 *
 * @returns 是否返回成功
 */
async function goBack(): Promise<boolean> {
  if (state.stack.length === 0) return false

  const from = state.current
  const to = state.stack[state.stack.length - 1]
  if (!(await fireBeforeLeave(from, to))) return false

  state.stack.pop()
  state.current = to

  fireAfterEnter(from, to)
  return true
}

/**
 * 直接跳转到目标画面，并清空导航栈。
 * 适用于「返回标题」等不需要回退历史的场景。
 *
 * @returns 是否切换成功
 */
async function resetTo(screen: ScreenId): Promise<boolean> {
  if (screen === state.current && state.stack.length === 0) return true

  const from = state.current
  if (!(await fireBeforeLeave(from, screen))) return false

  state.stack.length = 0
  state.current = screen

  if (screen === 'game') {
    state.gameActivated = true
  }

  fireAfterEnter(from, screen)
  return true
}

/**
 * 注册导航副作用钩子，返回取消注册函数。
 * 通常在页面 onMounted 中调用，onUnmounted 中取消。
 */
function onNavigate(h: NavigationHooks): () => void {
  hooks.push(h)
  return () => {
    const idx = hooks.indexOf(h)
    if (idx !== -1) hooks.splice(idx, 1)
  }
}

export function useNavigator() {
  return {
    state: readonly(state) as DeepReadonly<NavigatorState>,
    canGoBack,
    isInGame,
    navigateTo,
    goBack,
    resetTo,

    onNavigate,
  }
}
