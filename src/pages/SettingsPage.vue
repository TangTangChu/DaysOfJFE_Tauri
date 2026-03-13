<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useGalgameFacade } from '../app/bootstrap'
import { useNavigator } from '../app/navigator'
import type { GameSettings } from '../shared/types/engine'
import GalButton from '../components/ui/GalButton.vue'
import GalTabs from '../components/ui/GalTabs.vue'

const facade = useGalgameFacade()
const { goBack } = useNavigator()

const loaded = ref(false)
const saved = ref(false)
const activeTab = ref<'audio' | 'text' | 'system'>('audio')

const model = reactive<GameSettings>({
  audio: { master: 1, bgm: 0.8, voice: 0.8, sfx: 0.8, mute: false },
  text: {
    fontFamily: '',
    fontSize: 28,
    lineHeight: 1.8,
    textSpeed: 32,
    autoDelayMs: 1200,
  },
  transition: { enabled: true, speedRate: 1 },
  input: { keymap: {} },
  system: { skipReadOnly: false, autoModeInterruptOnChoice: true },
})

onMounted(async () => {
  try {
    const s = await facade.getSettings()
    Object.assign(model, s)
  } catch {}
  loaded.value = true
})

async function save() {
  await facade.patchSettings(model)
  saved.value = true
  setTimeout(() => {
    saved.value = false
  }, 1500)
}

async function reset() {
  const s = await facade.resetSettings()
  Object.assign(model, s)
  saved.value = true
  setTimeout(() => {
    saved.value = false
  }, 1500)
}

function back() {
  goBack()
}

let pushTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => model.audio,
  () => {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(
      () => facade.patchSettings({ audio: model.audio }),
      150,
    )
  },
  { deep: true },
)

const tabs = [
  { id: 'audio' as const, label: '声音', sub: 'Audio' },
  { id: 'text' as const, label: '文本', sub: 'Text' },
  { id: 'system' as const, label: '系统', sub: 'System' },
]

function fmtPct(v: number) {
  return Math.round(v * 100)
}
</script>

<template>
  <div class="relative w-full h-full overflow-hidden bg-gal-bg-base">
    <div
      class="relative z-10 flex flex-col h-full px-12 pt-10 pb-8 max-w-200 mx-auto animate-[fadeIn_0.5s_ease-out_both]"
      v-if="loaded"
    >
      <header class="text-center mb-8">
        <h1
          class="font-serif text-[32px] font-extrabold text-gal-text tracking-[0.15em] m-0 inline-flex items-center gap-4 gal-ornament"
        >
          设定
        </h1>
        <p
          class="text-xs text-gal-text-pink/60 tracking-[0.25em] mt-1.5 font-sans"
        >
          Settings
        </p>
      </header>
      <GalTabs v-model="activeTab" :tabs="tabs" />
      <div class="flex-1 overflow-y-auto min-h-0 px-4">
        <Transition
          enter-active-class="transition-all duration-300 ease-in-out"
          leave-active-class="transition-all duration-200 ease-in-out"
          enter-from-class="opacity-0 translate-y-2.5"
          leave-to-class="opacity-0 -translate-y-2.5"
          mode="out-in"
        >
          <!-- 音声 -->
          <div v-if="activeTab === 'audio'" key="audio" class="py-2">
            <div class="flex flex-col gap-6 gal-panel px-10 py-8">
              <div class="flex items-center gap-5">
                <label
                  class="w-45 shrink-0 text-[15px] text-gal-text tracking-[0.08em] font-sans font-medium"
                  >主音量<span
                    class="block text-[11px] text-gal-text-sub tracking-[0.12em] mt-0.5"
                    >Master</span
                  ></label
                >
                <input
                  type="range"
                  class="gal-range"
                  v-model.number="model.audio.master"
                  min="0"
                  max="1"
                  step="0.01"
                />
                <span
                  class="w-14 text-right text-sm text-gal-text-light tracking-[0.05em] font-bold tabular-nums"
                  >{{ fmtPct(model.audio.master) }}</span
                >
              </div>

              <div class="flex items-center gap-5">
                <label
                  class="w-45 shrink-0 text-[15px] text-gal-text tracking-[0.08em] font-sans font-medium"
                  >BGM</label
                >
                <input
                  type="range"
                  class="gal-range"
                  v-model.number="model.audio.bgm"
                  min="0"
                  max="1"
                  step="0.01"
                />
                <span
                  class="w-14 text-right text-sm text-gal-text-light tracking-[0.05em] font-bold tabular-nums"
                  >{{ fmtPct(model.audio.bgm) }}</span
                >
              </div>

              <div class="flex items-center gap-5">
                <label
                  class="w-45 shrink-0 text-[15px] text-gal-text tracking-[0.08em] font-sans font-medium"
                  >语音<span
                    class="block text-[11px] text-gal-text-sub tracking-[0.12em] mt-0.5"
                    >Voice</span
                  ></label
                >
                <input
                  type="range"
                  class="gal-range"
                  v-model.number="model.audio.voice"
                  min="0"
                  max="1"
                  step="0.01"
                />
                <span
                  class="w-14 text-right text-sm text-gal-text-light tracking-[0.05em] font-bold tabular-nums"
                  >{{ fmtPct(model.audio.voice) }}</span
                >
              </div>

              <div class="flex items-center gap-5">
                <label
                  class="w-45 shrink-0 text-[15px] text-gal-text tracking-[0.08em] font-sans font-medium"
                  >音效<span
                    class="block text-[11px] text-gal-text-sub tracking-[0.12em] mt-0.5"
                    >SFX</span
                  ></label
                >
                <input
                  type="range"
                  class="gal-range"
                  v-model.number="model.audio.sfx"
                  min="0"
                  max="1"
                  step="0.01"
                />
                <span
                  class="w-14 text-right text-sm text-gal-text-light tracking-[0.05em] font-bold tabular-nums"
                  >{{ fmtPct(model.audio.sfx) }}</span
                >
              </div>

              <div class="flex items-center gap-5">
                <label
                  class="w-45 shrink-0 text-[15px] text-gal-text tracking-[0.08em] font-sans font-medium"
                  >静音<span
                    class="block text-[11px] text-gal-text-sub tracking-[0.12em] mt-0.5"
                    >Mute</span
                  ></label
                >
                <div
                  class="gal-toggle"
                  :class="{ active: model.audio.mute }"
                  @click="model.audio.mute = !model.audio.mute"
                />
              </div>
            </div>
          </div>

          <!-- 文字 -->
          <div v-else-if="activeTab === 'text'" key="text" class="py-2">
            <div class="flex flex-col gap-6 gal-panel px-10 py-8">
              <div class="flex items-center gap-5">
                <label
                  class="w-45 shrink-0 text-[15px] text-gal-text tracking-[0.08em] font-sans font-medium"
                  >文字大小<span
                    class="block text-[11px] text-gal-text-sub tracking-[0.12em] mt-0.5"
                    >Size</span
                  ></label
                >
                <input
                  type="range"
                  class="gal-range"
                  v-model.number="model.text.fontSize"
                  min="14"
                  max="42"
                  step="1"
                />
                <span
                  class="w-14 text-right text-sm text-gal-text-light tracking-[0.05em] font-bold tabular-nums"
                  >{{ model.text.fontSize }}px</span
                >
              </div>

              <div class="flex items-center gap-5">
                <label
                  class="w-45 shrink-0 text-[15px] text-gal-text tracking-[0.08em] font-sans font-medium"
                  >显示速度<span
                    class="block text-[11px] text-gal-text-sub tracking-[0.12em] mt-0.5"
                    >Speed</span
                  ></label
                >
                <input
                  type="range"
                  class="gal-range"
                  v-model.number="model.text.textSpeed"
                  min="1"
                  max="100"
                  step="1"
                />
                <span
                  class="w-14 text-right text-sm text-gal-text-light tracking-[0.05em] font-bold tabular-nums"
                  >{{ model.text.textSpeed }}</span
                >
              </div>

              <div class="flex items-center gap-5">
                <label
                  class="w-45 shrink-0 text-[15px] text-gal-text tracking-[0.08em] font-sans font-medium"
                  >自动等待<span
                    class="block text-[11px] text-gal-text-sub tracking-[0.12em] mt-0.5"
                    >Auto Delay</span
                  ></label
                >
                <input
                  type="range"
                  class="gal-range"
                  v-model.number="model.text.autoDelayMs"
                  min="200"
                  max="5000"
                  step="100"
                />
                <span
                  class="w-14 text-right text-sm text-gal-text-light tracking-[0.05em] font-bold tabular-nums"
                  >{{ (model.text.autoDelayMs / 1000).toFixed(1) }}s</span
                >
              </div>
            </div>
          </div>

          <!-- 系統 -->
          <div v-else-if="activeTab === 'system'" key="system" class="py-2">
            <div class="flex flex-col gap-6 gal-panel px-10 py-8">
              <div class="flex items-center gap-5">
                <label
                  class="w-45 shrink-0 text-[15px] text-gal-text tracking-[0.08em] font-sans font-medium"
                  >仅快进已读<span
                    class="block text-[11px] text-gal-text-sub tracking-[0.12em] mt-0.5"
                    >Skip Read Only</span
                  ></label
                >
                <div
                  class="gal-toggle"
                  :class="{ active: model.system.skipReadOnly }"
                  @click="
                    model.system.skipReadOnly = !model.system.skipReadOnly
                  "
                />
              </div>

              <div class="flex items-center gap-5">
                <label
                  class="w-45 shrink-0 text-[15px] text-gal-text tracking-[0.08em] font-sans font-medium"
                  >选项停顿<span
                    class="block text-[11px] text-gal-text-sub tracking-[0.12em] mt-0.5"
                    >Auto Stop on Choice</span
                  ></label
                >
                <div
                  class="gal-toggle"
                  :class="{ active: model.system.autoModeInterruptOnChoice }"
                  @click="
                    model.system.autoModeInterruptOnChoice =
                      !model.system.autoModeInterruptOnChoice
                  "
                />
              </div>
            </div>
          </div>
        </Transition>
      </div>
      <footer
        class="flex justify-between items-center pt-7 border-t border-gal-border mt-6 shrink-0"
      >
        <GalButton @click="back" text="返回" subtext="Back" />
        <div class="flex items-center gap-4">
          <Transition
            enter-active-class="transition-all duration-300 ease"
            leave-active-class="transition-all duration-500 ease"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <span
              v-if="saved"
              class="text-[13px] text-gal-text-pink tracking-widest font-bold animate-[savedPop_0.4s_cubic-bezier(0.4,0,0.2,1)]"
              >已保存 Saved</span
            >
          </Transition>
          <GalButton @click="reset" text="恢复默认" subtext="Reset" />
          <GalButton
            variant="filled"
            @click="save"
            text="应用"
            subtext="Apply"
          />
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes savedPop {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
  50% {
    transform: translateY(-2px) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
