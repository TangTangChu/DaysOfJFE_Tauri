<script setup lang="ts">
export interface TabItem {
  id: string | number
  label: string
  sub?: string
}

defineProps<{
  tabs: TabItem[]
  modelValue: string | number
}>()

defineEmits<{
  'update:modelValue': [value: string | number]
}>()
</script>

<template>
  <nav class="flex justify-center gap-2 mb-8 border-b border-gal-border pb-0">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="group flex flex-col items-center gap-0.5 px-8 pt-3 pb-3.5 bg-transparent border-none cursor-pointer relative transition-all duration-300 ease-in-out"
      :class="{ active: modelValue === tab.id }"
      @click="$emit('update:modelValue', tab.id)"
    >
      <span
        class="text-base tracking-[0.15em] text-gal-text-sub font-sans font-bold transition-colors duration-300 group-hover:text-gal-text-pink group-[.active]:text-gal-text"
        >{{ tab.label }}</span
      >
      <span
        v-if="tab.sub"
        class="text-[10px] tracking-[0.2em] text-gal-text-sub/50 uppercase transition-colors duration-300 group-[.active]:text-gal-text-pink"
        >{{ tab.sub }}</span
      >
      <div
        class="absolute -bottom-px left-1/5 w-3/5 h-[2px] bg-transparent transition-all duration-300 ease-in-out rounded-t-sm group-[.active]:left-1/10 group-[.active]:w-4/5 group-[.active]:h-[3px] group-[.active]:bg-gal-text-pink"
      ></div>
    </button>
  </nav>
</template>
