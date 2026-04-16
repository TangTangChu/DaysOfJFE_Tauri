<script setup lang="ts">
defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", val: number): void;
}>();

function onInput(e: Event) {
    const target = e.target as HTMLInputElement;
    emit("update:modelValue", Number(target.value));
}
</script>

<template>
    <input
        type="range"
        class="appearance-none [-webkit-appearance:none] w-full h-4 bg-md-surface-container-highest rounded-lg outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:[-webkit-appearance:none] [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:h-11 [&::-webkit-slider-thumb]:rounded-xs [&::-webkit-slider-thumb]:bg-md-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200 [&::-webkit-slider-thumb]:ease-[cubic-bezier(0.2,0,0,1)] [&::-webkit-slider-thumb]:shadow-[0_0_0_0_rgba(212,132,154,0.12)] hover:[&::-webkit-slider-thumb]:scale-110 hover:[&::-webkit-slider-thumb]:shadow-[0_0_0_8px_rgba(212,132,154,0.12)]"
        :min="min ?? 0"
        :max="max ?? 100"
        :step="step ?? 1"
        :value="modelValue"
        @input="onInput"
    />
</template>
