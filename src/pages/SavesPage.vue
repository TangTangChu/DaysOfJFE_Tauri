<template>
  <section
    class="relative w-full h-full overflow-hidden bg-gal-bg-base font-sans"
  >
    <div
      class="relative z-10 flex flex-col h-full px-12 pt-10 pb-8 max-w-250 mx-auto animate-[fadeIn_0.5s_ease-out_both]"
    >
      <header class="text-center mb-8 shrink-0">
        <h1
          class="font-serif text-[32px] font-extrabold text-gal-text tracking-[0.15em] m-0 inline-flex items-center gap-4 gal-ornament"
        >
          存档与读取
        </h1>
        <div
          class="text-xs text-gal-text-pink/60 tracking-[0.25em] mt-1.5 font-sans"
        >
          SAVE & LOAD
        </div>
      </header>
      <div class="flex justify-center items-center gap-4 mb-6 shrink-0">
        <GalButton
          text="返回"
          subtext="Title"
          layout="horizontal"
          @click="back"
        />
        <div class="w-px h-6 bg-gal-border mx-2"></div>
        <GalButton
          text="快速存档"
          subtext="Q.Save"
          layout="horizontal"
          @click="facade.quickSave(0).then(refresh)"
        />
        <GalButton
          text="快速读取"
          subtext="Q.Load"
          layout="horizontal"
          @click="
            facade.quickLoad(0).then(() => {
              goBack()
              navigateTo('game')
            })
          "
        />
      </div>

      <p
        v-if="error"
        class="text-red-500 text-center text-sm mb-4 bg-red-500/10 p-2 rounded"
      >
        {{ error }}
      </p>

      <div
        class="flex-1 overflow-y-auto grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-5 px-3 pb-6 content-start [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gal-border [&::-webkit-scrollbar-thumb]:rounded-[3px] hover:[&::-webkit-scrollbar-thumb]:bg-gal-border-hover"
      >
        <div
          v-for="slot in displaySlots"
          :key="slot.index"
          class="group relative flex gal-panel h-27.5 overflow-hidden transition-colors duration-300 hover:border-gal-border-hover"
          :class="{
            'border-dashed bg-white/40 hover:bg-gal-bg-panel hover:border-solid':
              !slot.data,
          }"
        >
          <div
            class="flex items-center justify-center w-12 bg-gal-border/50 border-r border-gal-border font-serif text-2xl font-bold text-gal-text-pink/80 group-[.border-dashed]:text-gal-text-sub group-[.border-dashed]:opacity-40"
          >
            {{ String(slot.index).padStart(2, '0') }}
          </div>

          <template v-if="slot.data">
            <div class="flex-1 flex flex-col p-4">
              <div class="flex-1">
                <div
                  class="text-base font-bold text-gal-text tracking-[0.05em] mb-1.5 line-clamp-2"
                >
                  {{ slot.data.sceneTitle || '未知场景' }}
                </div>
                <div class="text-xs text-gal-text-light/80 font-mono">
                  {{ new Date(slot.data.timestamp).toLocaleString() }}
                </div>
              </div>
              <div class="flex gap-2 justify-end mt-auto">
                <button
                  class="px-4 py-1 text-xs tracking-widest bg-gal-text-pink border border-gal-text-pink rounded text-white cursor-pointer transition-colors duration-200 hover:bg-gal-text-pink-hover hover:border-gal-text-pink-hover"
                  @click="doLoad(slot.index, 'manual')"
                >
                  读取
                </button>
                <button
                  class="px-4 py-1 text-xs tracking-widest bg-transparent border border-gal-border rounded text-gal-text-light cursor-pointer transition-colors duration-200 hover:bg-gal-bg-panel-hover hover:border-gal-border-hover hover:text-gal-text-pink-hover"
                  @click="doSave(slot.index, 'manual')"
                >
                  覆盖
                </button>
                <button
                  class="px-4 py-1 text-xs tracking-widest bg-transparent border border-gal-border rounded text-gal-text-light cursor-pointer transition-colors duration-200 hover:bg-red-100 hover:border-red-500 hover:text-red-500"
                  @click="doDelete(slot.index, 'manual')"
                >
                  删除
                </button>
              </div>
            </div>
          </template>
          <template v-else>
            <div
              class="flex-1 flex flex-col justify-center items-center cursor-pointer p-4"
              @click="doSave(slot.index, 'manual')"
            >
              <div
                class="text-[20px] tracking-[0.2em] text-gal-text-sub font-bold opacity-60"
              >
                NO DATA
              </div>
              <div class="text-xs tracking-widest text-gal-text-sub/50 mt-1">
                点击建立新存档
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useGalgameFacade } from '../app/bootstrap'
import { useNavigator } from '../app/navigator'
import type { SaveMeta } from '../shared/types/engine'
import GalButton from '../components/ui/GalButton.vue'

const { goBack, navigateTo } = useNavigator()
const facade = useGalgameFacade()

const slots = ref<SaveMeta[]>([])
const loading = ref(false)
const error = ref('')

// 固定显示 12 个存档位
const displaySlots = computed(() => {
  const result = []
  for (let i = 0; i < 12; i++) {
    const data = slots.value.find((s) => s.slot === i && s.kind === 'manual')
    result.push({ index: i, data })
  }
  return result
})

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    slots.value = await facade.listSaves()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function doSave(slot: number, kind: SaveMeta['kind'] = 'manual') {
  await facade.save(slot, kind)
  await refresh()
}

async function doLoad(slot: number, kind: SaveMeta['kind'] = 'manual') {
  await facade.load(slot, kind)
  goBack()
  await navigateTo('game')
}

async function doDelete(slot: number, kind: SaveMeta['kind'] = 'manual') {
  await facade.deleteSave(slot, kind)
  await refresh()
}

function back() {
  goBack()
}

onMounted(refresh)
</script>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
