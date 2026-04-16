<script setup lang="ts">
export interface SegmentItem {
    id: string;
    label: string;
    sub?: string;
}

defineProps<{
    modelValue: string;
    items: SegmentItem[];
}>();

defineEmits<{
    "update:modelValue": [value: string];
}>();
</script>

<template>
    <div
        class="inline-flex items-center gap-1 p-1 rounded-full bg-md-surface-container-high"
    >
        <button
            v-for="item in items"
            :key="item.id"
            class="h-10 px-5 rounded-full text-sm font-semibold tracking-[0.12em] transition-all duration-200"
            :class="
                modelValue === item.id
                    ? 'bg-md-primary text-md-on-primary'
                    : 'text-md-on-surface-variant hover:bg-md-surface-container-highest'
            "
            @click="$emit('update:modelValue', item.id)"
        >
            <div class="flex flex-col items-center leading-none">
                <span>{{ item.label }}</span>
                <span
                    v-if="item.sub"
                    class="text-[10px] tracking-[0.2em] uppercase opacity-70"
                    >{{ item.sub }}</span
                >
            </div>
        </button>
    </div>
</template>
