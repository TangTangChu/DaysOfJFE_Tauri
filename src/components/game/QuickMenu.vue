<template>
  <div
    class="absolute top-0 right-0 w-32 h-full z-40 flex items-center justify-end pr-4"
    @mouseenter="handleEnter"
    @mouseleave="handleLeave"
  >
    <Transition
      enter-active-class="transition-all duration-300 ease-in-out"
      leave-active-class="transition-all duration-200 ease-in-out"
      enter-from-class="opacity-0 translate-x-4"
      leave-to-class="opacity-0 translate-x-4"
    >
      <div
        v-if="showMenu"
        class="flex flex-col gap-1.5 p-3 gal-panel-glass z-50 rounded-3xl w-27.5"
        @click.stop
      >
        <button
          v-for="btn in menuButtons"
          :key="btn.id"
          class="group relative flex flex-col items-center justify-center w-full py-2.5 rounded-xl cursor-pointer border-none outline-none transition-all duration-300 overflow-hidden"
          :class="[
            btn.isActive
              ? 'bg-gal-text-pink/15 text-gal-text-pink'
              : 'bg-transparent text-gal-text-sub hover:bg-gal-border/40 hover:text-gal-text',
          ]"
          @click="emit('action', btn.action as any)"
        >
          <div
            class="absolute inset-0 bg-gal-text-pink/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          ></div>

          <span
            class="text-[13px] tracking-[0.15em] font-sans font-bold z-10 transition-colors duration-300"
            :class="{ 'text-gal-text-pink': btn.isActive }"
            >{{ btn.label }}</span
          >
          <span
            class="text-[9px] tracking-[0.05em] uppercase z-10 mt-0.5 transition-colors duration-300"
            :class="
              btn.isActive ? 'text-gal-text-pink/80' : 'text-gal-text-sub/70'
            "
            >{{ btn.sub }}</span
          >
          <div
            class="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gal-text-pink transition-all duration-300"
            :class="
              btn.isActive
                ? 'opacity-100 scale-100 animate-pulse'
                : 'opacity-0 scale-0'
            "
          ></div>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  autoMode?: boolean
}>()

const emit = defineEmits<{
  (
    e: 'action',
    type:
      | 'quickSave'
      | 'quickLoad'
      | 'toggleAuto'
      | 'navSaves'
      | 'navSettings'
      | 'navTitle',
  ): void
}>()

const showMenu = ref(false)
let hideTimer: number | null = null

const menuButtons = computed(() => [
  {
    id: 'qs',
    label: '快存',
    sub: 'Q.Save',
    action: 'quickSave',
    isActive: false,
  },
  {
    id: 'ql',
    label: '快读',
    sub: 'Q.Load',
    action: 'quickLoad',
    isActive: false,
  },
  {
    id: 'auto',
    label: '自动',
    sub: 'Auto',
    action: 'toggleAuto',
    isActive: props.autoMode,
  },
  {
    id: 'save',
    label: '存档',
    sub: 'Save',
    action: 'navSaves',
    isActive: false,
  },
  {
    id: 'conf',
    label: '设置',
    sub: 'Config',
    action: 'navSettings',
    isActive: false,
  },
  {
    id: 'title',
    label: '标题',
    sub: 'Title',
    action: 'navTitle',
    isActive: false,
  },
])

function handleEnter() {
  if (hideTimer) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
  showMenu.value = true
}

function handleLeave() {
  hideTimer = window.setTimeout(() => {
    showMenu.value = false
  }, 250)
}
</script>
