<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
    variant?: "filled" | "tonal" | "outlined" | "text";
    disabled?: boolean;
    text?: string;
    subtext?: string;
    layout?: "horizontal" | "vertical";
}>();

const emit = defineEmits<{
    (e: "click", event: MouseEvent): void;
}>();

const variantClass = computed(() => {
    switch (props.variant) {
        case "filled":
            return "px-6 bg-md-primary text-md-on-primary border-0";
        case "text":
            return "px-4 bg-transparent text-md-primary border-0";
        case "outlined":
            return "px-6 bg-transparent border border-md-outline text-md-primary";
        default:
            return "px-6 bg-md-primary-container text-md-on-primary-container border-0";
    }
});

const contentClass = computed(() => {
    if (props.layout === "horizontal") {
        return "flex flex-row items-baseline justify-center gap-2";
    }
    return "flex flex-col items-center justify-center leading-none gap-1 py-1";
});
</script>

<template>
    <button
        class="relative inline-flex items-center justify-center min-h-10 rounded-full font-sans text-sm font-semibold tracking-wider cursor-pointer overflow-hidden transition-all duration-200 select-none before:content-[''] before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-200 before:ease-[cubic-bezier(0.2,0,0,1)] hover:before:opacity-[0.08] active:before:opacity-[0.12]"
        :class="[
            variantClass,
            { 'opacity-50 cursor-not-allowed pointer-events-none': disabled },
            variant === 'tonal' || !variant ? 'before:bg-md-on-surface' : '',
            variant === 'filled' ? 'before:bg-md-on-primary' : '',
            variant === 'text' || variant === 'outlined'
                ? 'before:bg-md-primary'
                : '',
        ]"
        :disabled="disabled"
        @click="emit('click', $event)"
    >
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
