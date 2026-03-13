<script setup lang="ts">
import { ref } from 'vue'
import { useGalgameFacade } from '../app/bootstrap'
import { useNavigator } from '../app/navigator'
import GalButton from '../components/ui/GalButton.vue'
import prologueRaw from '../assets/scripts/v2/prologue.yaml?raw'

const facade = useGalgameFacade()
const { navigateTo } = useNavigator()

const loading = ref(false)
const booted = ref(false)
const hasQuickSave = ref(false)

import { onMounted } from 'vue'
onMounted(async () => {
  await facade.boot()
  booted.value = true
  const saves = await facade.listSaves()
  hasQuickSave.value = saves.some((s) => s.kind === 'quick')
})

async function startGame() {
  if (loading.value) return
  loading.value = true
  try {
    if (!booted.value) {
      await facade.boot()
      booted.value = true
    }
    await facade.loadScript({ raw: prologueRaw })
    await facade.start({ sceneId: 'scene_opening' })
    await navigateTo('game')
  } catch (e) {
    console.error('游戏启动失败:', e)
  } finally {
    loading.value = false
  }
}

async function continueGame() {
  if (loading.value || !hasQuickSave.value) return
  loading.value = true
  try {
    if (!booted.value) {
      await facade.boot()
      booted.value = true
    }
    await facade.loadScript({ raw: prologueRaw })
    await facade.quickLoad(0)
    await navigateTo('game')
  } catch (e) {
    console.error('继续游戏失败:', e)
  } finally {
    loading.value = false
  }
}

function goSaves() {
  navigateTo('saves')
}

function goSettings() {
  navigateTo('settings')
}

async function exitGame() {
  if ('__TAURI__' in window) {
    const { exit } = await import('@tauri-apps/plugin-process')
    await exit(0)
  } else {
    console.warn('当前不在 Tauri 环境中，无法退出游戏')
  }
}

function particleStyle(i: number) {
  const left = 10 + ((i * 15) % 80)
  const delay = (i * 1.2) % 6
  const size = 2 + (i % 3) * 2
  const duration = 5 + (i % 4) * 2
  return {
    left: `${left}%`,
    width: `${size}px`,
    height: `${size}px`,
    animationDelay: `${delay}s`,
    animationDuration: `${duration}s`,
  }
}
</script>

<template>
  <div
    class="relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-gal-bg-base font-sans"
  >
    <div class="absolute inset-0 bg-gal-bg-base pointer-events-none"></div>
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        v-for="i in 30"
        :key="i"
        class="absolute -top-5 bg-gal-text-pink/30 rounded-[4px_12px] opacity-0 animate-[petalFall_linear_infinite]"
        :style="particleStyle(i)"
      ></div>
    </div>
    <div
      class="relative z-10 flex flex-row items-center justify-around w-full max-w-250 px-10 animate-[fadeInBlur_1.5s_ease-out_both]"
    >
      <div class="flex flex-col items-start gap-3 flex-1">
        <span
          class="text-sm tracking-[0.4em] text-gal-text-sub font-sans uppercase"
          >A Visual Novel Experience</span
        >
        <h1
          class="font-serif text-[64px] font-bold text-gal-text tracking-widest leading-tight"
        >
          <span class="text-gal-text-pink">Days</span>of<span
            class="text-gal-text-pink"
            >J</span
          >FE
        </h1>
        <span
          class="text-base text-gal-text-sub tracking-[0.2em] italic font-serif"
          >The Illusion of My</span
        >
      </div>

      <nav class="flex flex-col items-end gap-3 flex-none">
        <GalButton
          variant="text"
          class="text-2xl items-end!"
          @click="startGame"
          :class="{ 'pointer-events-none opacity-70': loading }"
        >
          <div class="flex flex-col items-end">
            <span
              class="tracking-[0.25em] font-serif transition-colors duration-400"
              :class="{
                'animate-[pulseFast_1.5s_ease-in-out_infinite]': loading,
              }"
              >开始游戏</span
            >
            <span class="text-xs tracking-[0.3em] uppercase mt-1 opacity-60"
              >Start</span
            >
          </div>
        </GalButton>

        <GalButton
          variant="text"
          class="text-2xl items-end!"
          @click="continueGame"
          :class="{
            'pointer-events-none opacity-40': loading || !hasQuickSave,
          }"
        >
          <div class="flex flex-col items-end">
            <span
              class="tracking-[0.25em] font-serif transition-colors duration-400"
              :class="{
                'animate-[pulseFast_1.5s_ease-in-out_infinite]':
                  loading && hasQuickSave,
              }"
              >继续游戏</span
            >
            <span class="text-xs tracking-[0.3em] uppercase mt-1 opacity-60"
              >Continue</span
            >
          </div>
        </GalButton>

        <GalButton variant="text" class="text-2xl items-end!" @click="goSaves">
          <div class="flex flex-col items-end">
            <span
              class="tracking-[0.25em] font-serif transition-colors duration-400"
              >加载进度</span
            >
            <span class="text-xs tracking-[0.3em] uppercase mt-1 opacity-60"
              >Load</span
            >
          </div>
        </GalButton>

        <GalButton
          variant="text"
          class="text-2xl items-end!"
          @click="goSettings"
        >
          <div class="flex flex-col items-end">
            <span
              class="tracking-[0.25em] font-serif transition-colors duration-400"
              >游戏设置</span
            >
            <span class="text-xs tracking-[0.3em] uppercase mt-1 opacity-60"
              >Config</span
            >
          </div>
        </GalButton>

        <GalButton variant="text" class="text-2xl items-end!" @click="exitGame">
          <div class="flex flex-col items-end">
            <span
              class="tracking-[0.25em] font-serif transition-colors duration-400"
              >结束游戏</span
            >
            <span class="text-xs tracking-[0.3em] uppercase mt-1 opacity-60"
              >Exit</span
            >
          </div>
        </GalButton>
      </nav>
    </div>

    <div
      class="absolute bottom-6 right-8 text-xs text-gal-text-sub tracking-[0.15em] font-sans"
    >
      Version 0.1.0
    </div>
  </div>
</template>
<style scoped>
@reference tailwindcss;

@keyframes petalFall {
  0% {
    opacity: 0;
    transform: translateY(-20px) rotate(0deg) scale(0.5);
  }
  15% {
    opacity: 0.8;
  }
  85% {
    opacity: 0.6;
  }
  100% {
    opacity: 0;
    transform: translateY(105vh) rotate(360deg) scale(1.2);
  }
}

@keyframes fadeInBlur {
  from {
    opacity: 0;
    filter: blur(8px);
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: scale(1);
  }
}

@keyframes pulseFast {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
    text-shadow: 0 0 12px rgba(212, 132, 154, 0.4);
  }
}
</style>
