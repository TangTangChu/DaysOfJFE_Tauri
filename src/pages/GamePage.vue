<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useGalgameFacade } from '../app/bootstrap'
import { useNavigator } from '../app/navigator'
import type { DialogueBacklogItem, EngineState } from '../shared/types/engine'
import DialogueBox from '../components/game/DialogueBox.vue'
import ChoiceLayer from '../components/game/ChoiceLayer.vue'
import QuickMenu from '../components/game/QuickMenu.vue'
import GalConfirmDialog from '../components/ui/GalConfirmDialog.vue'

const facade = useGalgameFacade()
const { navigateTo, goBack, onNavigate } = useNavigator()

const state = ref<EngineState>()
const localCursor = ref(0)
let typingTimer: number | null = null

const dialogue = computed(() => state.value?.dialogue)
const choice = computed(() => state.value?.choice)
const stage = computed(() => state.value?.stage)
const flags = computed(() => state.value?.flags)
const backlogItems = computed<DialogueBacklogItem[]>(() => {
  return state.value?.dialogue.backlog ?? []
})
const backlogOpen = ref(false)
const backlogPanelRef = ref<HTMLDivElement | null>(null)

const displayText = computed(() => {
  if (!dialogue.value) return ''
  const { textRendered, typing } = dialogue.value
  if (!typing.active || typing.completed) return textRendered
  return textRendered.slice(0, localCursor.value)
})

const isTyping = computed(() => {
  return dialogue.value?.typing.active && !dialogue.value?.typing.completed
})

watch(backlogOpen, async (open) => {
  if (!open) return
  await nextTick()
  if (backlogPanelRef.value) {
    backlogPanelRef.value.scrollTop = backlogPanelRef.value.scrollHeight
  }
})

watch(
  () => dialogue.value,
  (d) => {
    if (!d) return

    if (d.typing.active && !d.typing.completed) {
      if (d.typing.cursor === 0 && localCursor.value > 0) {
        localCursor.value = 0
      }

      if (typingTimer) clearTimeout(typingTimer)

      const speed = state.value?.settings.text.textSpeed ?? 32
      const baseDelay = Math.max(10, 1000 / speed)

      const typeNextChar = () => {
        if (localCursor.value < d.textRendered.length) {
          const char = d.textRendered[localCursor.value]
          localCursor.value++
          let currentDelay = baseDelay
          if (
            ['，', '。', '！', '？', '…', ',', '.', '!', '?'].includes(char)
          ) {
            currentDelay = baseDelay * 12
          }

          typingTimer = window.setTimeout(typeNextChar, currentDelay)
        } else {
          if (typingTimer) {
            clearTimeout(typingTimer)
            typingTimer = null
          }
          facade.skipCurrent() // 通知引擎输入完成
        }
      }
      typingTimer = window.setTimeout(typeNextChar, baseDelay)
    } else if (d.typing.completed) {
      // 被跳过或已完成
      if (typingTimer) {
        clearTimeout(typingTimer)
        typingTimer = null
      }
      localCursor.value = d.textRendered.length
    }
  },
  { deep: true, immediate: true },
)

let autoTimer: number | null = null

function clearAutoTimer() {
  if (autoTimer) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
}

function scheduleAutoAdvance() {
  clearAutoTimer()

  if (
    !flags.value?.autoMode ||
    isTyping.value ||
    choice.value?.open ||
    backlogOpen.value
  ) {
    return
  }

  const delay = state.value?.settings.text.autoDelayMs ?? 1000
  autoTimer = window.setTimeout(() => {
    if (
      flags.value?.autoMode &&
      !isTyping.value &&
      !choice.value?.open &&
      !backlogOpen.value
    ) {
      facade.next()
    }
  }, delay)
}

watch(
  () => isTyping.value,
  (typing) => {
    // 如果打字结束，且没有选项弹出，且处于Auto模式，那么等待后点击下一句
    clearAutoTimer()
    if (!typing) {
      scheduleAutoAdvance()
    }
  },
)

watch(
  () => flags.value?.autoMode,
  (isAuto) => {
    // 处理在对话结束后突然开启 Auto 的情况
    if (isAuto) {
      scheduleAutoAdvance()
    } else {
      clearAutoTimer()
    }
  },
)

watch(backlogOpen, (open) => {
  if (open) {
    clearAutoTimer()
    return
  }
  scheduleAutoAdvance()
})

let unsub: (() => void) | undefined

onMounted(() => {
  unsub = facade.subscribe(() => {
    state.value = facade.getState()
  })
  state.value = facade.getState()
})

onUnmounted(() => {
  unsub?.()
  clearAutoTimer()
  if (typingTimer) {
    clearTimeout(typingTimer)
    typingTimer = null
  }
})

function onKeydown(e: KeyboardEvent) {
  if (!state.value) return

  if (backlogOpen.value) {
    if (e.code === 'Escape') {
      e.preventDefault()
      closeBacklog()
      return
    }

    if (e.code === 'ArrowUp') {
      e.preventDefault()
      scrollBacklogBy(-96)
      return
    }

    if (e.code === 'ArrowDown') {
      e.preventDefault()
      scrollBacklogBy(96)
      return
    }
  }

  if (e.code === 'ArrowUp') {
    e.preventDefault()
    openBacklog()
    return
  }

  if (e.code === 'ArrowDown') {
    e.preventDefault()
    handleNext()
    return
  }

  // Space / Enter 推进对话，Escape 隐藏/显示界面
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    if (state.value.flags.uiHidden) {
      facade.setUiHidden(false)
    } else {
      handleNext()
    }
    return
  }

  if (e.code === 'Escape') {
    e.preventDefault()
    facade.setUiHidden(!state.value.flags.uiHidden)
    return
  }

  const keymap = state.value.settings.input.keymap
  for (const [action, binding] of Object.entries(keymap)) {
    if (
      binding.code === e.code &&
      !!binding.ctrl === e.ctrlKey &&
      !!binding.shift === e.shiftKey &&
      !!binding.alt === e.altKey
    ) {
      e.preventDefault()
      switch (action) {
        case 'engine.next':
          handleNext()
          break
        case 'save.quick':
          facade.quickSave()
          break
        case 'load.quick':
          facade.quickLoad()
          break
        case 'engine.auto.toggle':
          toggleAuto()
          break
      }
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const confirmDialog = ref({
  visible: false,
  title: '',
  message: '',
  onConfirm: async () => {},
})

function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
) {
  confirmDialog.value.title = title
  confirmDialog.value.message = message
  confirmDialog.value.onConfirm = async () => {
    await onConfirm()
  }
  confirmDialog.value.visible = true
}

async function handleConfirm() {
  await confirmDialog.value.onConfirm()
  confirmDialog.value.visible = false
}

const cleanupNav = onNavigate({
  onBeforeLeave(_from, _to) {
    return true
  },
})
onUnmounted(() => cleanupNav())

function handleMainClick() {
  if (backlogOpen.value) {
    closeBacklog()
    return
  }

  if (state.value?.flags.uiHidden) {
    facade.setUiHidden(false)
    return
  }
  handleNext()
}

function handleRightClick() {
  if (!state.value) return

  if (backlogOpen.value) {
    closeBacklog()
    return
  }

  facade.setUiHidden(!state.value.flags.uiHidden)
}

function handleNext() {
  if (backlogOpen.value) {
    closeBacklog()
    return
  }

  if (choice.value?.open) return
  if (isTyping.value) {
    facade.skipCurrent()
  } else {
    facade.next()
  }
}

function toggleAuto() {
  if (!state.value) return
  facade.setAutoMode(!state.value.flags.autoMode)
}

function handleChoose(optionId: string) {
  facade.choose(optionId)
}

function openBacklog() {
  if (!backlogItems.value.length) return
  backlogOpen.value = true
}

function closeBacklog() {
  backlogOpen.value = false
}

function scrollBacklogBy(delta: number) {
  if (!backlogPanelRef.value) return
  backlogPanelRef.value.scrollBy({ top: delta, behavior: 'smooth' })
}

function handleWheel(event: WheelEvent) {
  if (event.deltaY < 0) {
    if (backlogOpen.value) {
      scrollBacklogBy(-120)
    } else {
      openBacklog()
    }
    return
  }

  if (event.deltaY > 0) {
    if (backlogOpen.value) {
      scrollBacklogBy(120)
    } else {
      handleNext()
    }
  }
}

function handleQuickAction(type: string) {
  switch (type) {
    case 'quickSave':
      showConfirm(
        '快速存档',
        '要将当前进度保存为快速存档吗？这会覆盖之前的快速存档。',
        () => {
          facade.quickSave()
        },
      )
      break
    case 'quickLoad':
      showConfirm(
        '快速读档',
        '要读取最近的快速存档吗？\n当前未保存的进度将会丢失。',
        () => {
          facade.quickLoad()
        },
      )
      break
    case 'toggleAuto':
      if (state.value) {
        facade.setAutoMode(!state.value.flags.autoMode)
      }
      break
    case 'navSaves':
      navigateTo('saves')
      break
    case 'navSettings':
      navigateTo('settings')
      break
    case 'navTitle':
      showConfirm(
        '返回标题',
        '确定要返回标题画面吗？\n当前未保存的进度将会丢失。',
        async () => {
          await facade.resetSession()
          await goBack()
        },
      )
      break
  }
}
</script>

<template>
  <div
    class="relative w-full h-full overflow-hidden cursor-default select-none bg-black font-sans"
    @click="handleMainClick"
    @contextmenu.prevent="handleRightClick"
    @wheel.passive="handleWheel"
  >
    <div
      class="relative z-10 h-full w-full flex items-center justify-center px-0 py-0"
    >
      <div class="relative w-full h-full flex items-center justify-center">
        <div
          class="relative w-full aspect-video max-h-full overflow-hidden bg-black"
          style="max-width: calc(100vh * 16 / 9)"
        >
          <div
            class="absolute inset-0 bg-cover bg-center transition-[background-image] duration-800 ease"
            :style="
              stage?.backgroundKey
                ? { backgroundImage: `url(${stage.backgroundKey})` }
                : {}
            "
          />

          <div
            class="absolute inset-0 flex items-end justify-center pointer-events-none overflow-hidden"
          >
            <template v-if="stage?.characters">
              <div
                v-for="(char, id) in stage.characters"
                :key="id"
                v-show="char.visible"
                class="absolute bottom-0 transition-all duration-500 ease"
                :class="{
                  'left-[8%]': char.slot === 'left',
                  'left-1/2 -translate-x-1/2': char.slot === 'center',
                  'right-[8%]': char.slot === 'right',
                }"
              >
                <img
                  v-if="char.poseKey"
                  :src="char.poseKey"
                  :alt="String(id)"
                  class="max-h-[92%] max-w-[30vw] object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.4)]"
                />
              </div>
            </template>
          </div>

          <ChoiceLayer
            v-if="choice?.open && !flags?.uiHidden"
            :open="!!choice?.open"
            :prompt="choice.prompt"
            :options="choice.options"
            @choose="handleChoose"
          />
        </div>
      </div>
    </div>
    <DialogueBox
      v-if="dialogue?.visible && !flags?.uiHidden && !backlogOpen"
      layout="overlay"
      :speaker-name="dialogue.speakerName ?? undefined"
      :display-text="displayText"
      :is-typing="isTyping ?? false"
      :choice-open="!!choice?.open"
      @next="handleMainClick"
    />
    <QuickMenu
      v-show="!flags?.uiHidden && !backlogOpen"
      :auto-mode="flags?.autoMode"
      @action="handleQuickAction"
    />
    <GalConfirmDialog
      :visible="confirmDialog.visible"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      @confirm="handleConfirm"
      @cancel="confirmDialog.visible = false"
    />
    <div
      v-if="flags?.autoMode && !flags?.uiHidden && !backlogOpen"
      class="absolute top-4 left-5 px-4 py-1 text-xs tracking-[0.2em] text-gal-text-pink bg-black/72 backdrop-blur-sm border border-white/16 rounded-[20px] z-10 font-bold animate-[autoPulse_2s_ease-in-out_infinite]"
    >
      AUTO
    </div>
    <div
      v-if="backlogOpen"
      class="absolute inset-0 z-20 flex items-end justify-center bg-black/68 backdrop-blur-md px-6 py-8"
      @click.stop="closeBacklog"
    >
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/70 to-transparent"
      />
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent"
      />
      <div
        ref="backlogPanelRef"
        class="relative z-10 h-full w-full max-w-4xl overflow-y-auto rounded-[32px] bg-neutral-950/88 px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/5"
        @click.stop
      >
        <div class="mb-5 border-b border-white/8 pb-3">
          <div class="space-y-1.5">
            <p
              class="text-[11px] font-medium uppercase tracking-[0.24em] text-white/42"
            >
              History
            </p>
            <h2 class="text-[28px] font-medium tracking-[0.01em] text-white/92">
              历史记录
            </h2>
          </div>
        </div>

        <div v-if="backlogItems.length" class="space-y-4 pb-8">
          <article
            v-for="item in backlogItems"
            :key="item.id"
            class="rounded-[24px] bg-white/[0.045] px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.14)] ring-1 ring-white/6"
          >
            <header class="mb-2 text-sm">
              <div class="min-w-0">
                <p class="truncate text-base font-medium text-white/90">
                  {{ item.speakerName || '旁白' }}
                </p>
                <p
                  class="mt-1 text-xs tracking-[0.18em] text-white/34 uppercase"
                >
                  {{ item.mode === 'dialogue' ? 'Dialogue' : 'Narration' }}
                </p>
              </div>
            </header>
            <p
              class="whitespace-pre-wrap break-words text-[15px] leading-8 text-white/76"
            >
              {{ item.text }}
            </p>
          </article>
        </div>

        <div
          v-else
          class="flex h-full min-h-[240px] items-center justify-center rounded-[24px] bg-white/[0.035] text-sm font-medium tracking-[0.12em] text-white/42 ring-1 ring-white/6"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference tailwindcss;

@keyframes autoPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
</style>
