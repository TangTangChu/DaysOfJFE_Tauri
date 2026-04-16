<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

interface DropdownOption {
    id: string;
    label: string;
}

const props = withDefaults(
    defineProps<{
        modelValue: string;
        options: DropdownOption[];
        placeholder?: string;
        searchable?: boolean;
        size?: "default" | "sm";
    }>(),
    {
        placeholder: "请选择",
        searchable: false,
        size: "default",
    },
);

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
}>();

const open = ref(false);
const search = ref("");
const listRef = ref<HTMLElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);
const highlightIndex = ref(-1);
const panelStyle = ref<Record<string, string>>({});
const panelThemeClass = ref("");

let cleanupFloatingPanel: (() => void) | null = null;

function updatePanelPosition() {
    if (!open.value || !triggerRef.value) return;
    const rect = triggerRef.value.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const panelHeight = Math.min(260, Math.max(180, viewportHeight - 24));
    const spaceBelow = viewportHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUpward = spaceBelow < panelHeight && spaceAbove > spaceBelow;
    const top = openUpward
        ? Math.max(8, rect.top - Math.min(panelHeight, spaceAbove) - 4)
        : Math.min(viewportHeight - 8, rect.bottom + 4);
    const left = Math.max(
        8,
        Math.min(rect.left, viewportWidth - rect.width - 8),
    );

    panelStyle.value = {
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${Math.min(rect.width, viewportWidth - 16)}px`,
        maxHeight: `${Math.max(160, viewportHeight - 16)}px`,
        zIndex: "50",
    };
}

function syncPanelTheme() {
    panelThemeClass.value = triggerRef.value?.closest(".theme-dark")
        ? "theme-dark"
        : "";
}

function bindFloatingPanelListeners() {
    const listener = () => updatePanelPosition();
    window.addEventListener("resize", listener);
    window.addEventListener("scroll", listener, true);
    cleanupFloatingPanel = () => {
        window.removeEventListener("resize", listener);
        window.removeEventListener("scroll", listener, true);
    };
}

const selectedLabel = computed(() => {
    const opt = props.options.find((o) => o.id === props.modelValue);
    return opt?.label ?? "";
});

const filteredOptions = computed(() => {
    if (!props.searchable || !search.value.trim()) return props.options;
    const keyword = search.value.trim().toLowerCase();
    return props.options.filter(
        (o) =>
            o.label.toLowerCase().includes(keyword) ||
            o.id.toLowerCase().includes(keyword),
    );
});

function toggle() {
    open.value = !open.value;
    if (open.value) {
        search.value = "";
        highlightIndex.value = filteredOptions.value.findIndex(
            (o) => o.id === props.modelValue,
        );
        nextTick(() => {
            syncPanelTheme();
            updatePanelPosition();
            bindFloatingPanelListeners();
            if (props.searchable) searchRef.value?.focus();
            scrollHighlightIntoView();
        });
    } else {
        cleanupFloatingPanel?.();
        cleanupFloatingPanel = null;
    }
}

function close() {
    open.value = false;
    cleanupFloatingPanel?.();
    cleanupFloatingPanel = null;
}

function select(id: string) {
    emit("update:modelValue", id);
    close();
}

function scrollHighlightIntoView() {
    nextTick(() => {
        const el = listRef.value?.querySelector('[data-highlighted="true"]');
        el?.scrollIntoView({ block: "nearest" });
    });
}

function handleKeydown(e: KeyboardEvent) {
    if (!open.value) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            toggle();
        }
        return;
    }

    if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
    }

    if (e.key === "ArrowDown") {
        e.preventDefault();
        highlightIndex.value = Math.min(
            highlightIndex.value + 1,
            filteredOptions.value.length - 1,
        );
        scrollHighlightIntoView();
        return;
    }

    if (e.key === "ArrowUp") {
        e.preventDefault();
        highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
        scrollHighlightIntoView();
        return;
    }

    if (e.key === "Enter") {
        e.preventDefault();
        if (
            highlightIndex.value >= 0 &&
            highlightIndex.value < filteredOptions.value.length
        ) {
            select(filteredOptions.value[highlightIndex.value].id);
        }
    }
}

watch(search, () => {
    highlightIndex.value = 0;
});

onBeforeUnmount(() => {
    cleanupFloatingPanel?.();
    cleanupFloatingPanel = null;
});
</script>

<template>
    <div class="relative" @keydown="handleKeydown">
        <button
            ref="triggerRef"
            type="button"
            class="w-full flex items-center justify-between gap-2 bg-transparent border-[1.5px] border-md-outline-variant rounded-xl px-3.5 text-sm font-inherit text-md-on-surface cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:border-md-outline hover:bg-md-surface-container-lowest"
            :class="[
                open ? 'border-md-primary bg-md-surface-container-lowest' : '',
                size === 'sm'
                    ? 'min-h-9 px-3 text-[13px] rounded-[10px]'
                    : 'min-h-10',
            ]"
            @click="toggle"
        >
            <span v-if="selectedLabel" class="truncate">{{
                selectedLabel
            }}</span>
            <span v-else class="truncate opacity-60">{{ placeholder }}</span>
            <svg
                class="shrink-0 w-3.5 h-3.5 opacity-60 transition-transform duration-200"
                :class="{ 'rotate-180': open }"
                viewBox="0 0 20 20"
                fill="currentColor"
            >
                <path
                    fill-rule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clip-rule="evenodd"
                />
            </svg>
        </button>

        <Teleport to="body">
            <Transition name="dropdown">
                <div
                    v-if="open"
                    :class="['fixed inset-0 z-80', panelThemeClass]"
                >
                    <div class="absolute inset-0" @click="close" />
                    <div
                        class="z-1 bg-md-surface-container-high border border-md-outline-variant rounded-xl overflow-hidden"
                        :style="panelStyle"
                    >
                        <div
                            v-if="searchable"
                            class="px-2 pt-2 pb-1 border-b border-md-outline-variant/40"
                        >
                            <input
                                ref="searchRef"
                                v-model="search"
                                class="w-full bg-md-surface-container-highest text-xs px-3 py-1.5 rounded-lg outline-none border border-transparent focus:border-md-primary text-md-on-surface placeholder:text-md-on-surface-variant/60"
                                placeholder="搜索..."
                                @keydown.stop
                            />
                        </div>

                        <div
                            ref="listRef"
                            class="max-h-[min(220px,calc(100vh-32px))] overflow-y-auto overscroll-contain p-1 scrollbar-thin scrollbar-thumb-md-outline-variant scrollbar-track-transparent custom-scrollbar"
                        >
                            <button
                                v-for="(opt, i) in filteredOptions"
                                :key="opt.id"
                                type="button"
                                class="w-full flex items-center justify-between gap-2 p-2 px-3 rounded-lg border-none bg-transparent text-md-on-surface text-[13px] font-inherit text-left cursor-pointer transition-colors duration-100 ease-in-out hover:bg-md-surface-container-highest"
                                :class="{
                                    'bg-md-surface-container-highest':
                                        i === highlightIndex,
                                    'text-md-primary font-semibold':
                                        opt.id === modelValue,
                                }"
                                :data-highlighted="i === highlightIndex"
                                @click="select(opt.id)"
                                @mouseenter="highlightIndex = i"
                            >
                                <span class="truncate">{{ opt.label }}</span>
                                <svg
                                    v-if="opt.id === modelValue"
                                    class="shrink-0 w-3.5 h-3.5 text-md-primary"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                            </button>
                            <div
                                v-if="!filteredOptions.length"
                                class="text-xs text-center text-md-on-surface-variant/60 py-4"
                            >
                                无匹配选项
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
.custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: var(--color-md-outline-variant) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
    width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--color-md-outline-variant);
    border-radius: 3px;
}

/* ── Transitions ── */
.dropdown-enter-active {
    transition:
        opacity 0.15s ease,
        transform 0.15s cubic-bezier(0.2, 0, 0, 1);
}

.dropdown-leave-active {
    transition:
        opacity 0.1s ease,
        transform 0.1s ease;
}

.dropdown-enter-from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
}

.dropdown-leave-to {
    opacity: 0;
    transform: translateY(-2px);
}
</style>
