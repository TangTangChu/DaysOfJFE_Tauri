<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

interface DropdownOption {
  id: string
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: DropdownOption[]
    placeholder?: string
    searchable?: boolean
    size?: 'default' | 'sm'
  }>(),
  {
    placeholder: '请选择',
    searchable: false,
    size: 'default',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const open = ref(false)
const search = ref('')
const listRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const highlightIndex = ref(-1)
const panelStyle = ref<Record<string, string>>({})
const panelThemeClass = ref('')

let cleanupFloatingPanel: (() => void) | null = null

function updatePanelPosition() {
  if (!open.value || !triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth
  const panelHeight = Math.min(260, Math.max(180, viewportHeight - 24))
  const spaceBelow = viewportHeight - rect.bottom - 8
  const spaceAbove = rect.top - 8
  const openUpward = spaceBelow < panelHeight && spaceAbove > spaceBelow
  const top = openUpward
    ? Math.max(8, rect.top - Math.min(panelHeight, spaceAbove) - 4)
    : Math.min(viewportHeight - 8, rect.bottom + 4)
  const left = Math.max(8, Math.min(rect.left, viewportWidth - rect.width - 8))

  panelStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${Math.min(rect.width, viewportWidth - 16)}px`,
    maxHeight: `${Math.max(160, viewportHeight - 16)}px`,
    zIndex: '50',
  }
}

function syncPanelTheme() {
  panelThemeClass.value = triggerRef.value?.closest('.theme-dark')
    ? 'theme-dark'
    : ''
}

function bindFloatingPanelListeners() {
  const listener = () => updatePanelPosition()
  window.addEventListener('resize', listener)
  window.addEventListener('scroll', listener, true)
  cleanupFloatingPanel = () => {
    window.removeEventListener('resize', listener)
    window.removeEventListener('scroll', listener, true)
  }
}

const selectedLabel = computed(() => {
  const opt = props.options.find((o) => o.id === props.modelValue)
  return opt?.label ?? ''
})

const filteredOptions = computed(() => {
  if (!props.searchable || !search.value.trim()) return props.options
  const keyword = search.value.trim().toLowerCase()
  return props.options.filter(
    (o) =>
      o.label.toLowerCase().includes(keyword) ||
      o.id.toLowerCase().includes(keyword),
  )
})

function toggle() {
  open.value = !open.value
  if (open.value) {
    search.value = ''
    highlightIndex.value = filteredOptions.value.findIndex(
      (o) => o.id === props.modelValue,
    )
    nextTick(() => {
      syncPanelTheme()
      updatePanelPosition()
      bindFloatingPanelListeners()
      if (props.searchable) searchRef.value?.focus()
      scrollHighlightIntoView()
    })
  } else {
    cleanupFloatingPanel?.()
    cleanupFloatingPanel = null
  }
}

function close() {
  open.value = false
  cleanupFloatingPanel?.()
  cleanupFloatingPanel = null
}

function select(id: string) {
  emit('update:modelValue', id)
  close()
}

function scrollHighlightIntoView() {
  nextTick(() => {
    const el = listRef.value?.querySelector('[data-highlighted="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (!open.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      toggle()
    }
    return
  }

  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightIndex.value = Math.min(
      highlightIndex.value + 1,
      filteredOptions.value.length - 1,
    )
    scrollHighlightIntoView()
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0)
    scrollHighlightIntoView()
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    if (
      highlightIndex.value >= 0 &&
      highlightIndex.value < filteredOptions.value.length
    ) {
      select(filteredOptions.value[highlightIndex.value].id)
    }
  }
}

watch(search, () => {
  highlightIndex.value = 0
})

onBeforeUnmount(() => {
  cleanupFloatingPanel?.()
  cleanupFloatingPanel = null
})
</script>

<template>
  <div class="gal-dropdown-root" @keydown="handleKeydown">
    <button
      ref="triggerRef"
      type="button"
      class="gal-dropdown-trigger"
      :class="{
        'gal-dropdown-trigger--open': open,
        'gal-dropdown-trigger--sm': size === 'sm',
      }"
      @click="toggle"
    >
      <span v-if="selectedLabel" class="truncate">{{ selectedLabel }}</span>
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
          :class="['gal-dropdown-floating-layer', panelThemeClass]"
        >
          <div class="gal-dropdown-backdrop" @click="close" />
          <div class="gal-dropdown-panel" :style="panelStyle">
            <div
              v-if="searchable"
              class="px-2 pt-2 pb-1 border-b border-(--color-md-outline-variant)/40"
            >
              <input
                ref="searchRef"
                v-model="search"
                class="w-full bg-md-surface-container-highest text-xs px-3 py-1.5 rounded-lg outline-none border border-transparent focus:border-(--color-md-primary) text-(--color-md-on-surface) placeholder:text-(--color-md-on-surface-variant)/60"
                placeholder="搜索..."
                @keydown.stop
              />
            </div>

            <div ref="listRef" class="gal-dropdown-list">
              <button
                v-for="(opt, i) in filteredOptions"
                :key="opt.id"
                type="button"
                class="gal-dropdown-item"
                :class="{
                  'gal-dropdown-item--selected': opt.id === modelValue,
                  'gal-dropdown-item--highlighted': i === highlightIndex,
                }"
                :data-highlighted="i === highlightIndex"
                @click="select(opt.id)"
                @mouseenter="highlightIndex = i"
              >
                <span class="truncate">{{ opt.label }}</span>
                <svg
                  v-if="opt.id === modelValue"
                  class="shrink-0 w-3.5 h-3.5 text-(--color-md-primary)"
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
                class="text-xs text-center text-(--color-md-on-surface-variant)/60 py-4"
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
.gal-dropdown-root {
  position: relative;
}

.gal-dropdown-floating-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.gal-dropdown-backdrop {
  position: absolute;
  inset: 0;
}

.gal-dropdown-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 40px;
  background: var(--color-md-surface-container-highest);
  border: 1px solid var(--color-md-outline-variant);
  border-radius: 12px;
  padding: 0 14px;
  font-size: 14px;
  font-family: inherit;
  color: var(--color-md-on-surface);
  cursor: pointer;
  transition:
    border-color 0.2s cubic-bezier(0.2, 0, 0, 1),
    background 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.gal-dropdown-trigger--sm {
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
  border-radius: 10px;
}

.gal-dropdown-trigger:hover {
  border-color: var(--color-md-outline);
}

.gal-dropdown-trigger--open {
  border-color: var(--color-md-primary);
  background: var(--color-md-surface-container-high);
}

/* ── Dropdown panel ── */
.gal-dropdown-panel {
  z-index: 1;
  background: var(--color-md-surface-container-high);
  border: 1px solid var(--color-md-outline-variant);
  border-radius: 12px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.gal-dropdown-list {
  max-height: min(220px, calc(100vh - 32px));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-md-outline-variant) transparent;
}

.gal-dropdown-list::-webkit-scrollbar {
  width: 5px;
}

.gal-dropdown-list::-webkit-scrollbar-track {
  background: transparent;
}

.gal-dropdown-list::-webkit-scrollbar-thumb {
  background: var(--color-md-outline-variant);
  border-radius: 3px;
}

/* ── Items ── */
.gal-dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--color-md-on-surface);
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}

.gal-dropdown-item:hover,
.gal-dropdown-item--highlighted {
  background: var(--color-md-surface-container-highest);
}

.gal-dropdown-item--selected {
  color: var(--color-md-primary);
  font-weight: 600;
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
