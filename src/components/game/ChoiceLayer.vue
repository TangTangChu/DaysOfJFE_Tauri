<template>
  <Transition
    enter-active-class="transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)]"
    leave-active-class="transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
    enter-from-class="opacity-0 scale-95"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="open"
      class="absolute inset-0 flex items-center justify-center z-30 bg-black/20 backdrop-blur-sm"
      @click.stop
    >
      <div class="flex flex-col items-center gap-6 min-w-90">
        <p
          v-if="prompt"
          class="text-2xl text-(--color-md-on-surface) mb-2 tracking-[0.15em] font-serif font-bold drop-shadow-[0_2px_4px_rgba(255,255,255,0.7)]"
        >
          {{ prompt }}
        </p>

        <button
          v-for="opt in options"
          :key="opt.id"
          :disabled="opt.disabled"
          class="w-full relative overflow-hidden px-8 py-4 bg-(--color-md-surface-container) rounded-full text-(--color-md-on-surface) text-base tracking-[0.15em] font-sans font-medium cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] border-none hover:bg-(--color-md-surface-container-high) hover:text-(--color-md-primary) active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none group"
          @click="emit('choose', opt.id)"
        >
          <div
            class="absolute inset-0 bg-(--color-md-on-surface) opacity-0 transition-opacity duration-200 group-hover:opacity-[0.08] group-active:opacity-[0.12] pointer-events-none"
          ></div>
          <span class="relative z-10">{{ opt.text }}</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { ChoiceOptionState } from '../../shared/types/engine'

defineProps<{
  open: boolean
  prompt?: string
  options: ChoiceOptionState[]
}>()

const emit = defineEmits<{
  (e: 'choose', id: string): void
}>()
</script>
