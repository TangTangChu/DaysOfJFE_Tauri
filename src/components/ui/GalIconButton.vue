<script setup lang="ts">
const props = defineProps<{
    icon: string;
    label?: string;
    active?: boolean;
    variant?: "tonal" | "ghost";
}>();

const emit = defineEmits<{
    (e: "click", event: MouseEvent): void;
}>();

const baseClass =
    "relative inline-flex items-center justify-center w-10 h-10 rounded-full border border-transparent transition-all duration-200 overflow-hidden";
const variants: Record<string, string> = {
    tonal: "bg-md-primary-container text-md-on-primary-container hover:bg-md-primary-container/80",
    ghost: "bg-transparent text-md-on-surface-variant hover:bg-md-surface-container-high hover:text-md-on-surface",
};

const activeClass =
    "border-md-primary text-md-on-primary-container bg-md-primary-container";
</script>

<template>
    <button
        :class="[
            baseClass,
            variants[props.variant ?? 'ghost'],
            { [activeClass]: active },
        ]"
        :title="label"
        @click="emit('click', $event)"
    >
        <span class="text-lg leading-none">{{ icon }}</span>
        <span class="sr-only" v-if="label">{{ label }}</span>
    </button>
</template>
