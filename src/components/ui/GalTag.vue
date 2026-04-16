<script setup lang="ts">
defineProps<{
    text: string;
}>();
</script>

<template>
    <span
        class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-md-secondary-container text-md-on-secondary-container font-bold text-[10px] uppercase tracking-[0.14em]"
        >{{ text }}</span
    >
</template>
