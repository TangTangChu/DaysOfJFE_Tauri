<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

function toggle() {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    class="gal-toggle"
    :class="{ active: modelValue }"
    @click="toggle"
  />
</template>

<style scoped>
.gal-toggle {
  position: relative;
  width: 52px;
  height: 32px;
  border-radius: 16px;
  background: var(--color-md-surface-container-highest);
  border: 2px solid var(--color-md-outline);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  display: inline-block;
  box-sizing: border-box;
  padding: 0;
  flex-shrink: 0;
}

.gal-toggle::after {
  content: '';
  position: absolute;
  top: 6px;
  left: 6px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-md-outline);
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.gal-toggle:hover::after {
  background: var(--color-md-on-surface-variant);
  box-shadow: 0 0 0 8px rgba(82, 67, 71, 0.08);
}

.gal-toggle.active {
  background: var(--color-md-primary);
  border-color: var(--color-md-primary);
}

.gal-toggle.active::after {
  width: 24px;
  height: 24px;
  top: 2px;
  left: 22px;
  background: var(--color-md-on-primary);
}

.gal-toggle.active:hover::after {
  background: var(--color-md-primary-container);
  box-shadow: 0 0 0 8px rgba(212, 132, 154, 0.12);
}
</style>
