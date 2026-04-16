<script setup lang="ts">
const props = defineProps<{
    modelValue: boolean;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", val: boolean): void;
}>();

function toggle() {
    emit("update:modelValue", !props.modelValue);
}
</script>

<template>
    <button
        type="button"
        class="relative inline-block shrink-0 w-13 h-8 rounded-2xl border-2 cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] p-0 box-border after:content-[''] after:absolute after:rounded-full after:transition-all after:duration-200 after:ease-[cubic-bezier(0.2,0,0,1)] hover:after:shadow-[0_0_0_8px_rgba(82,67,71,0.08)]"
        :class="[
            modelValue
                ? 'bg-md-primary border-md-primary after:w-6 after:h-6 after:top-0.5 after:left-5.5 after:bg-md-on-primary hover:after:bg-md-primary-container hover:after:shadow-[0_0_0_8px_rgba(212,132,154,0.12)]'
                : 'bg-md-surface-container-highest border-md-outline after:w-4 after:h-4 after:top-1.5 after:left-1.5 after:bg-md-outline hover:after:bg-md-on-surface-variant',
        ]"
        @click="toggle"
    />
</template>
