<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-md-surface-container-highest text-(--color-md-on-surface-variant) border border-(--color-md-outline-variant) text-xs tracking-wider"
    >{{ text }}</span
  >
</template>
