<script setup lang="ts">
defineProps<{
    label: string;
    subLabel?: string;
    hint?: string;
}>();
</script>

<template>
    <div class="flex flex-col gap-2">
        <div class="flex items-end justify-between gap-4">
            <div class="flex flex-col">
                <span
                    class="text-[13px] tracking-[0.12em] text-md-on-surface font-sans font-semibold"
                    >{{ label }}</span
                >
                <span
                    v-if="subLabel"
                    class="text-[10px] text-md-on-surface-variant tracking-[0.2em] uppercase"
                    >{{ subLabel }}</span
                >
            </div>
            <span
                v-if="hint"
                class="text-[11px] text-md-on-surface-variant/70 tracking-widest"
                >{{ hint }}</span
            >
        </div>
        <div>
            <slot />
        </div>
    </div>
</template>
