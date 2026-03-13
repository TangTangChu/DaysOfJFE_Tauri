<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-in-out"
    leave-active-class="transition-all duration-200 ease-in-out"
    enter-from-class="opacity-0 scale-95"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="visible"
      class="fixed inset-0 z-100 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      @click.stop
    >
      <div
        class="gal-panel px-10 py-8 min-w-[360px] max-w-[420px] flex flex-col items-center text-center shadow-2xl"
        @click.stop
      >
        <h3
          v-if="title"
          class="text-xl font-serif font-bold text-gal-text tracking-widest mb-4"
        >
          {{ title }}
        </h3>
        <p
          class="text-base text-gal-text-sub tracking-[0.05em] leading-relaxed mb-8 font-sans"
        >
          {{ message }}
        </p>
        <div class="flex items-center justify-center gap-6 w-full mt-auto">
          <GalButton
            variant="text"
            text="取消"
            subtext="Cancel"
            class="flex-1 opacity-80"
            @click="$emit('cancel')"
          />
          <GalButton
            variant="filled"
            text="确定"
            subtext="Confirm"
            class="flex-1"
            @click="$emit('confirm')"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import GalButton from './GalButton.vue'

defineProps<{
  visible: boolean
  title?: string
  message: string
}>()

defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>
