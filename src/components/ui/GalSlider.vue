<script setup lang="ts">
defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: number): void
}>()

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  emit('update:modelValue', Number(target.value))
}
</script>

<template>
  <input
    type="range"
    class="gal-range"
    :min="min ?? 0"
    :max="max ?? 100"
    :step="step ?? 1"
    :value="modelValue"
    @input="onInput"
  />
</template>

<style scoped>
.gal-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 16px;
  background: var(--color-md-surface-container-highest);
  border-radius: 8px;
  outline: none;
  cursor: pointer;
}

.gal-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 4px;
  height: 44px;
  border-radius: 2px;
  background: var(--color-md-primary);
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 0 0 0 rgba(212, 132, 154, 0.12);
}

.gal-range::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 0 0 8px rgba(212, 132, 154, 0.12);
}
</style>
