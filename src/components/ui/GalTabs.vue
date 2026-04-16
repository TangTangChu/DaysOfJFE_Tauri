<script setup lang="ts">
export interface TabItem {
    id: string | number;
    label: string;
    sub?: string;
}

defineProps<{
    tabs: TabItem[];
    modelValue: string | number;
}>();

defineEmits<{
    "update:modelValue": [value: string | number];
}>();
</script>

<template>
    <nav
        class="flex justify-center gap-2 mb-8 border-b border-md-outline-variant/30 pb-0"
    >
        <button
            v-for="tab in tabs"
            :key="tab.id"
            class="group flex flex-col items-center gap-1 px-8 pt-3 pb-3.5 bg-transparent border-none cursor-pointer relative transition-all duration-300 ease-in-out"
            :class="modelValue === tab.id ? 'active' : ''"
            @click="$emit('update:modelValue', tab.id)"
        >
            <span
                class="text-base tracking-[0.15em] text-md-on-surface-variant font-sans font-bold transition-colors duration-300 group-hover:text-md-primary group-[.active]:text-md-on-surface"
                >{{ tab.label }}</span
            >
            <span
                v-if="tab.sub"
                class="text-[10px] tracking-[0.2em] text-md-on-surface-variant/50 uppercase transition-colors duration-300 group-[.active]:text-md-primary"
                >{{ tab.sub }}</span
            >
            <div
                class="absolute -bottom-px left-[20%] w-[60%] h-0.5 bg-transparent transition-all duration-300 ease-in-out rounded-t-sm group-[.active]:left-[10%] group-[.active]:w-[80%] group-[.active]:h-0.75 group-[.active]:bg-md-primary"
            ></div>
        </button>
    </nav>
</template>
