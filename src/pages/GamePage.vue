<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useGalgameFacade } from '../app/bootstrap'
import { useNavigator } from '../app/navigator'
import type { EngineState } from '../shared/types/engine'
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

const displayText = computed(() => {
  if (!dialogue.value) return ''
  const { textRendered, typing } = dialogue.value
  if (!typing.active || typing.completed) return textRendered
  return textRendered.slice(0, localCursor.value)
})

const isTyping = computed(() => {
  return dialogue.value?.typing.active && !dialogue.value?.typing.completed
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
watch(
  () => isTyping.value,
  (typing) => {
    if (autoTimer) {
      clearTimeout(autoTimer)
      autoTimer = null
    }

    // 如果打字结束，且没有选项弹出，且处于Auto模式，那么等待后点击下一句
    if (!typing && flags.value?.autoMode && !choice.value?.open) {
      const delay = state.value?.settings.text.autoDelayMs ?? 1000
      autoTimer = window.setTimeout(() => {
        if (flags.value?.autoMode && !isTyping.value && !choice.value?.open) {
          facade.next()
        }
      }, delay)
    }
  },
)

watch(
  () => flags.value?.autoMode,
  (isAuto) => {
    // 处理在对话结束后突然开启 Auto 的情况
    if (isAuto && !isTyping.value && !choice.value?.open) {
      if (autoTimer) clearTimeout(autoTimer)
      const delay = state.value?.settings.text.autoDelayMs ?? 1000
      autoTimer = window.setTimeout(() => {
        if (flags.value?.autoMode && !isTyping.value && !choice.value?.open) {
          facade.next()
        }
      }, delay)
    } else if (!isAuto && autoTimer) {
      clearTimeout(autoTimer)
      autoTimer = null
    }
  },
)

let unsub: (() => void) | undefined

onMounted(() => {
  unsub = facade.subscribe(() => {
    state.value = facade.getState()
  })
  state.value = facade.getState()
})

onUnmounted(() => {
  unsub?.()
})

function onKeydown(e: KeyboardEvent) {
  if (!state.value) return

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
        case 'next':
          handleNext()
          break
        case 'quickSave':
          facade.quickSave()
          break
        case 'quickLoad':
          facade.quickLoad()
          break
        case 'autoToggle':
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
  onConfirm: () => {},
})

function showConfirm(title: string, message: string, onConfirm: () => void) {
  confirmDialog.value.title = title
  confirmDialog.value.message = message
  confirmDialog.value.onConfirm = onConfirm
  confirmDialog.value.visible = true
}

function handleConfirm() {
  confirmDialog.value.onConfirm()
  confirmDialog.value.visible = false
}

const cleanupNav = onNavigate({
  onBeforeLeave(_from, _to) {
    return true
  },
})
onUnmounted(() => cleanupNav())

function handleMainClick() {
  if (state.value?.flags.uiHidden) {
    facade.setUiHidden(false)
    return
  }
  handleNext()
}

function handleRightClick() {
  if (!state.value) return
  facade.setUiHidden(!state.value.flags.uiHidden)
}

function handleNext() {
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
        () => {
          goBack()
        },
      )
      break
  }
}
</script>

<template>
  <div
    class="relative w-full h-full overflow-hidden cursor-default select-none bg-gal-bg-base font-sans"
    @click="handleMainClick"
    @contextmenu.prevent="handleRightClick"
  >
    <div class="absolute inset-0">
      <div
        class="absolute inset-0 bg-cover bg-center transition-[background-image] duration-800 ease"
        :style="
          stage?.backgroundKey
            ? { backgroundImage: `url(${stage.backgroundKey})` }
            : {}
        "
      />
      <div class="absolute inset-0 bg-white/20 pointer-events-none" />
    </div>
    <div
      class="absolute inset-0 flex items-end justify-center pointer-events-none"
    >
      <template v-if="stage?.characters">
        <div
          v-for="(char, id) in stage.characters"
          :key="id"
          v-show="char.visible"
          class="absolute bottom-0 transition-all duration-500 ease"
          :class="{
            'left-[10%]': char.slot === 'left',
            'left-1/2 -translate-x-1/2': char.slot === 'center',
            'right-[10%]': char.slot === 'right',
          }"
        >
          <img
            v-if="char.poseKey"
            :src="char.poseKey"
            :alt="String(id)"
            class="max-h-[85vh] object-contain"
          />
        </div>
      </template>
    </div>
    <DialogueBox
      v-if="dialogue?.visible && !flags?.uiHidden"
      :speaker-name="dialogue.speakerName ?? undefined"
      :display-text="displayText"
      :is-typing="isTyping ?? false"
      :choice-open="!!choice?.open"
      @next="handleMainClick"
    />
    <ChoiceLayer
      v-if="choice?.open && !flags?.uiHidden"
      :open="!!choice?.open"
      :prompt="choice.prompt"
      :options="choice.options"
      @choose="handleChoose"
    />
    <QuickMenu
      v-show="!flags?.uiHidden"
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
      v-if="flags?.autoMode && !flags?.uiHidden"
      class="absolute top-4 left-5 px-4 py-1 text-xs tracking-[0.2em] text-gal-text-pink bg-white/80 backdrop-blur-sm border border-gal-text-pink/30 rounded-[20px] z-10 font-bold animate-[autoPulse_2s_ease-in-out_infinite]"
    >
      AUTO
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
