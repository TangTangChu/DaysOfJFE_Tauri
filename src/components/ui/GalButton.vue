<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  variant?: 'filled' | 'tonal' | 'outlined' | 'text'
  disabled?: boolean
  text?: string
  subtext?: string
  layout?: 'horizontal' | 'vertical'
}>()

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const btnClass = computed(() => {
  const base = 'gal-btn'
  const v = props.variant || 'tonal'
  const classes = [base]

  if (v === 'filled') {
    classes.push('gal-btn-primary')
  } else if (v === 'text') {
    classes.push('bg-transparent', 'text-(--color-md-primary)')
  } else if (v === 'outlined') {
    classes.push(
      'bg-transparent',
      'border',
      'border-(--color-md-outline)',
      'text-(--color-md-primary)',
    )
  }

  if (props.disabled) {
    classes.push('opacity-50 cursor-not-allowed pointer-events-none')
  }
  return classes.join(' ')
})

const contentClass = computed(() => {
  if (props.layout === 'horizontal') {
    return 'flex flex-row items-baseline justify-center gap-2'
  }
  return 'flex flex-col items-center justify-center leading-none gap-1 py-1'
})
</script>

<template>
  <button :class="btnClass" :disabled="disabled" @click="emit('click', $event)">
    <div v-if="text || subtext" :class="contentClass">
      <span
        v-if="text"
        class="text-base tracking-widest transition-colors duration-200"
        >{{ text }}</span
      >
      <span
        v-if="subtext"
        class="text-[0.65rem] opacity-60 font-semibold tracking-widest uppercase transition-colors duration-200"
        >{{ subtext }}</span
      >
    </div>
    <slot v-else />
  </button>
</template>
