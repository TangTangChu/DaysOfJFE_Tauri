<template>
    <div
        class="z-20"
        :class="
            layout === 'overlay'
                ? 'absolute bottom-0 left-0 right-0 px-6 pb-6'
                : 'w-full px-1 sm:px-2 pb-0'
        "
        @click.stop="emit('next')"
    >
        <div
            class="relative max-w-225 mx-auto px-8 py-6 rounded-3xl min-h-35"
            :class="[
                layout === 'docked'
                    ? 'shadow-[0_18px_44px_rgba(80,36,53,0.16)]'
                    : '',
                'bg-md-surface-container text-md-on-surface transition-background duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
            ]"
        >
            <div
                class="absolute top-0 left-8 right-8 h-0.5 bg-md-primary/20 pointer-events-none"
            ></div>
            <div
                class="absolute bottom-0 left-8 right-8 h-0.5 bg-md-primary/20 pointer-events-none"
            ></div>
            <div
                v-if="speakerName"
                class="absolute -top-8 left-8 px-2 py-1 flex items-end"
            >
                <span
                    class="text-[26px] tracking-widest text-md-primary font-serif font-extrabold drop-shadow-[0_2px_4px_rgba(255,255,255,0.8)]"
                    >{{ speakerName }}</span
                >
            </div>
            <div class="pt-2 min-h-20 flex items-start">
                <p
                    class="text-lg leading-[1.8] text-md-on-surface tracking-[0.05em] m-0 font-sans"
                >
                    {{ displayText }}
                    <span
                        v-if="isTyping"
                        class="inline-block text-md-primary animate-[typingPulse_1s_ease-in-out_infinite] ml-0.5"
                        >♭</span
                    >
                </p>
            </div>
            <!-- 等待指示器 -->
            <div
                v-if="!isTyping && !choiceOpen"
                class="absolute bottom-3 right-5"
            >
                <span
                    class="text-sm text-md-primary animate-[nextBounce_1s_ease-in-out_infinite] inline-block"
                    >▼</span
                >
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        speakerName?: string;
        displayText: string;
        isTyping: boolean;
        choiceOpen: boolean;
        layout?: "overlay" | "docked";
    }>(),
    {
        layout: "overlay",
    },
);

const emit = defineEmits<{
    (e: "next"): void;
}>();
</script>

<style scoped>
@keyframes typingPulse {
    0%,
    100% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.5;
        transform: scale(0.9);
    }
}

@keyframes nextBounce {
    0%,
    100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(4px);
    }
}
</style>
