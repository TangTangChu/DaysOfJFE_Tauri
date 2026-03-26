<script setup lang="ts">
import { reactive, watch } from 'vue'
import GalDropdown from '../ui/GalDropdown.vue'
import GalField from '../ui/GalField.vue'
import type { ScriptCommand } from '../../engine/script/schema'
import type { JsonValue } from '../../shared/types/engine'

interface AssetOption {
  id: string
  label: string
}

const props = defineProps<{
  command: ScriptCommand
  assetOptions?: {
    backgrounds: AssetOption[]
    standees: AssetOption[]
    bgm: AssetOption[]
    voice: AssetOption[]
    sfx: AssetOption[]
  }
}>()

const emit = defineEmits<{
  (e: 'update', patch: Record<string, JsonValue>): void
}>()

const slotOptions = [
  { id: 'left', label: '左 (left)' },
  { id: 'center', label: '中 (center)' },
  { id: 'right', label: '右 (right)' },
]

const interruptOptions = [
  { id: 'interrupt', label: '打断 (interrupt)' },
  { id: 'queue', label: '排队 (queue)' },
]

interface ChoiceOption {
  id: string
  text: string
  to: string
}

const form = reactive({
  // text
  text: '',
  speakerId: '',
  speakerName: '',
  // character
  charId: '',
  slot: '',
  poseKey: '',
  // bg
  bgKey: '',
  // flow
  to: '',
  ifExpr: '',
  thenTarget: '',
  elseTarget: '',
  sceneId: '',
  entry: '',
  scriptId: '',
  endingKey: '',
  // variables
  key: '',
  value: '',
  by: '1',
  statement: '',
  // audio
  audioKey: '',
  interruptPolicy: 'interrupt',
  // timing
  ms: '800',
  // emit
  event: '',
  // choice
  choiceId: '',
  prompt: '',
  options: [] as ChoiceOption[],
  // layer
  layer: '',
  layerPropsJson: '{}',
})

let applyTimer: number | null = null

function str(v: JsonValue | undefined): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function syncForm() {
  const p = props.command.payload ?? {}
  form.text = str(p.text)
  form.speakerId = str(p.speakerId)
  form.speakerName = str(p.speakerName)
  form.charId = str(p.charId)
  form.slot = str(p.slot)
  form.poseKey = str(p.poseKey)
  form.bgKey = str(p.bgKey)
  form.to = str(p.to)
  form.ifExpr = str(p.if)
  form.thenTarget = str(p.then)
  form.elseTarget = str(p.else)
  form.sceneId = str(p.sceneId)
  form.entry = str(p.entry)
  form.scriptId = str(p.scriptId)
  form.endingKey = str(p.endingKey)
  form.key = str(p.key)
  form.value = str(p.value)
  form.by = str(p.by || '1')
  form.statement = str(p.statement)
  form.audioKey = str(p.key)
  form.interruptPolicy = str(p.interruptPolicy || 'interrupt')
  form.ms = str(p.ms || '800')
  form.event = str(p.event)
  form.choiceId = str(p.choiceId)
  form.prompt = str(p.prompt)
  form.layer = str(p.layer)
  form.layerPropsJson = p.props ? JSON.stringify(p.props, null, 2) : '{}'

  // Parse options array
  const rawOpts = p.options
  if (Array.isArray(rawOpts)) {
    form.options = rawOpts.map((o: JsonValue) => {
      const obj = o as Record<string, JsonValue>
      return { id: str(obj.id), text: str(obj.text), to: str(obj.to) }
    })
  } else {
    form.options = []
  }
}

function buildPatch(): Record<string, JsonValue> {
  const t = props.command.type
  switch (t) {
    case 'dialogue':
      return {
        text: form.text,
        speakerId: form.speakerId,
        speakerName: form.speakerName,
      }
    case 'narration':
      return { text: form.text }
    case 'clear_dialogue':
      return {}
    case 'char_show': {
      const p: Record<string, JsonValue> = {
        charId: form.charId,
        slot: form.slot,
      }
      if (form.poseKey) p.poseKey = form.poseKey
      return p
    }
    case 'char_hide':
      return { charId: form.charId }
    case 'char_pose':
      return { charId: form.charId, poseKey: form.poseKey }
    case 'bg_set':
      return { bgKey: form.bgKey }
    case 'jump':
      return { to: form.to }
    case 'branch':
      return { if: form.ifExpr, then: form.thenTarget, else: form.elseTarget }
    case 'call':
      return { sceneId: form.sceneId, entry: form.entry }
    case 'script_jump':
      return { scriptId: form.scriptId, sceneId: form.sceneId }
    case 'end':
      return form.endingKey ? { endingKey: form.endingKey } : {}
    case 'set':
      return { key: form.key, value: parseAutoValue(form.value) }
    case 'inc':
      return { key: form.key, by: Number(form.by) || 1 }
    case 'dec':
      return { key: form.key, by: Number(form.by) || 1 }
    case 'expr':
      return { statement: form.statement }
    case 'bgm_play':
      return { key: form.audioKey }
    case 'bgm_stop':
      return {}
    case 'voice_play':
      return { key: form.audioKey, interruptPolicy: form.interruptPolicy }
    case 'sfx_play':
      return { key: form.audioKey }
    case 'wait':
      return { ms: Number(form.ms) || 0 }
    case 'choice_show':
      return {
        choiceId: form.choiceId,
        prompt: form.prompt,
        options: form.options.map((o) => ({
          id: o.id,
          text: o.text,
          to: o.to,
        })),
      }
    case 'layer_set': {
      let parsed: JsonValue = {}
      try {
        parsed = JSON.parse(form.layerPropsJson)
      } catch {
        /* keep empty */
      }
      return { layer: form.layer, props: parsed }
    }
    case 'emit': {
      let payload: JsonValue = {}
      try {
        payload = JSON.parse(str(props.command.payload?.payload))
      } catch {
        /* empty */
      }
      return { event: form.event, payload }
    }
    default:
      return { ...props.command.payload }
  }
}

function parseAutoValue(v: string): JsonValue {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null') return null
  const n = Number(v)
  if (!isNaN(n) && v.trim() !== '') return n
  return v
}

function applyNow() {
  if (applyTimer) {
    clearTimeout(applyTimer)
    applyTimer = null
  }
  emit('update', buildPatch())
}

function queueApply() {
  if (applyTimer) clearTimeout(applyTimer)
  applyTimer = window.setTimeout(applyNow, 350)
}

function addOption() {
  form.options.push({
    id: `opt_${form.options.length + 1}`,
    text: '新选项',
    to: '',
  })
  applyNow()
}

function removeOption(index: number) {
  form.options.splice(index, 1)
  applyNow()
}

watch(() => props.command, syncForm, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- ==================== dialogue ==================== -->
    <template v-if="command.type === 'dialogue'">
      <GalField label="说话人 ID" sub-label="Speaker ID">
        <input
          v-model="form.speakerId"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="说话人名" sub-label="Speaker Name">
        <input
          v-model="form.speakerName"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="台词" sub-label="Text">
        <textarea
          v-model="form.text"
          class="gal-textarea text-xs"
          style="min-height: 80px"
          @input="queueApply()"
        ></textarea>
      </GalField>
    </template>

    <!-- ==================== narration ==================== -->
    <template v-else-if="command.type === 'narration'">
      <GalField label="旁白文本" sub-label="Narration">
        <textarea
          v-model="form.text"
          class="gal-textarea text-xs"
          style="min-height: 80px"
          @input="queueApply()"
        ></textarea>
      </GalField>
    </template>

    <!-- ==================== char_show ==================== -->
    <template v-else-if="command.type === 'char_show'">
      <GalField label="角色 ID" sub-label="Character">
        <input
          v-model="form.charId"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="位置" sub-label="Slot">
        <GalDropdown
          v-model="form.slot"
          :options="slotOptions"
          size="sm"
          @update:model-value="applyNow"
        />
      </GalField>
      <GalField label="立绘" sub-label="Pose Key">
        <GalDropdown
          v-if="props.assetOptions?.standees?.length"
          v-model="form.poseKey"
          :options="props.assetOptions.standees"
          size="sm"
          @update:model-value="applyNow"
        />
        <input
          v-model="form.poseKey"
          class="gal-input text-xs py-1.5"
          placeholder="可选"
          @input="queueApply()"
        />
      </GalField>
    </template>

    <!-- ==================== char_pose ==================== -->
    <template v-else-if="command.type === 'char_pose'">
      <GalField label="角色 ID" sub-label="Character">
        <input
          v-model="form.charId"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="立绘" sub-label="Pose Key">
        <GalDropdown
          v-if="props.assetOptions?.standees?.length"
          v-model="form.poseKey"
          :options="props.assetOptions.standees"
          size="sm"
          @update:model-value="applyNow"
        />
        <input
          v-model="form.poseKey"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>

    <!-- ==================== char_hide ==================== -->
    <template v-else-if="command.type === 'char_hide'">
      <GalField label="角色 ID" sub-label="Character">
        <input
          v-model="form.charId"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>

    <!-- ==================== bg_set ==================== -->
    <template v-else-if="command.type === 'bg_set'">
      <GalField label="背景" sub-label="Background Key">
        <GalDropdown
          v-if="props.assetOptions?.backgrounds?.length"
          v-model="form.bgKey"
          :options="props.assetOptions.backgrounds"
          size="sm"
          :searchable="true"
          @update:model-value="applyNow"
        />
        <input
          v-model="form.bgKey"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>

    <!-- ==================== choice_show ==================== -->
    <template v-else-if="command.type === 'choice_show'">
      <GalField label="选择 ID" sub-label="Choice ID">
        <input
          v-model="form.choiceId"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="提示文本" sub-label="Prompt">
        <input
          v-model="form.prompt"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-[13px] font-semibold tracking-[0.12em]"
            >选项列表</span
          >
          <button
            class="text-[11px] px-2 py-0.5 rounded-lg bg-(--color-md-primary-container) text-md-on-primary-container cursor-pointer hover:opacity-80 transition-opacity"
            @click="addOption"
          >
            + 添加选项
          </button>
        </div>
        <div class="flex flex-col gap-2">
          <div
            v-for="(opt, i) in form.options"
            :key="i"
            class="rounded-2xl border border-(--color-md-outline-variant) p-3 flex flex-col gap-2"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10px] font-semibold opacity-50"
                >选项 {{ i + 1 }}</span
              >
              <button
                class="text-[10px] px-1.5 py-0.5 rounded-md cursor-pointer text-(--color-md-on-surface-variant) hover:text-red-500 transition-colors"
                @click="removeOption(i)"
              >
                删除
              </button>
            </div>
            <input
              v-model="opt.id"
              class="gal-input text-xs py-1"
              placeholder="选项 ID"
              @input="queueApply()"
            />
            <input
              v-model="opt.text"
              class="gal-input text-xs py-1"
              placeholder="选项文本"
              @input="queueApply()"
            />
            <input
              v-model="opt.to"
              class="gal-input text-xs py-1"
              placeholder="跳转目标 (to)"
              @input="queueApply()"
            />
          </div>
        </div>
      </div>
    </template>
    <template v-else-if="command.type === 'jump'">
      <GalField label="跳转目标" sub-label="Target Command">
        <input
          v-model="form.to"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'branch'">
      <GalField label="条件表达式" sub-label="If Expression">
        <input
          v-model="form.ifExpr"
          class="gal-input text-xs py-1.5 font-mono"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="为真跳转" sub-label="Then">
        <input
          v-model="form.thenTarget"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="为假跳转" sub-label="Else">
        <input
          v-model="form.elseTarget"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'call'">
      <GalField label="目标场景" sub-label="Scene ID">
        <input
          v-model="form.sceneId"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="入口指令" sub-label="Entry Command">
        <input
          v-model="form.entry"
          class="gal-input text-xs py-1.5"
          placeholder="可选"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'script_jump'">
      <GalField label="目标脚本" sub-label="Script ID">
        <input
          v-model="form.scriptId"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="目标场景" sub-label="Scene ID">
        <input
          v-model="form.sceneId"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'end'">
      <GalField label="结局标识" sub-label="Ending Key">
        <input
          v-model="form.endingKey"
          class="gal-input text-xs py-1.5"
          placeholder="可选"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'set'">
      <GalField label="变量名" sub-label="Key">
        <input
          v-model="form.key"
          class="gal-input text-xs py-1.5 font-mono"
          @input="queueApply()"
        />
      </GalField>
      <GalField
        label="值"
        sub-label="Value"
        hint="支持: 文本、数字、true/false/null"
      >
        <input
          v-model="form.value"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'inc' || command.type === 'dec'">
      <GalField label="变量名" sub-label="Key">
        <input
          v-model="form.key"
          class="gal-input text-xs py-1.5 font-mono"
          @input="queueApply()"
        />
      </GalField>
      <GalField
        :label="command.type === 'inc' ? '增加量' : '减少量'"
        sub-label="By"
      >
        <input
          v-model="form.by"
          type="number"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'expr'">
      <GalField label="表达式" sub-label="Statement" hint="结果存入 _">
        <input
          v-model="form.statement"
          class="gal-input text-xs py-1.5 font-mono"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'bgm_play'">
      <GalField label="音乐资源" sub-label="BGM Key">
        <GalDropdown
          v-if="props.assetOptions?.bgm?.length"
          v-model="form.audioKey"
          :options="props.assetOptions.bgm"
          size="sm"
          :searchable="true"
          @update:model-value="applyNow"
        />
        <input
          v-model="form.audioKey"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'sfx_play'">
      <GalField label="音效资源" sub-label="SFX Key">
        <GalDropdown
          v-if="props.assetOptions?.sfx?.length"
          v-model="form.audioKey"
          :options="props.assetOptions.sfx"
          size="sm"
          :searchable="true"
          @update:model-value="applyNow"
        />
        <input
          v-model="form.audioKey"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'voice_play'">
      <GalField label="语音资源" sub-label="Voice Key">
        <GalDropdown
          v-if="props.assetOptions?.voice?.length"
          v-model="form.audioKey"
          :options="props.assetOptions.voice"
          size="sm"
          :searchable="true"
          @update:model-value="applyNow"
        />
        <input
          v-model="form.audioKey"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="打断策略" sub-label="Interrupt Policy">
        <GalDropdown
          v-model="form.interruptPolicy"
          :options="interruptOptions"
          size="sm"
          @update:model-value="applyNow"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'wait'">
      <GalField label="等待时间" sub-label="Milliseconds">
        <input
          v-model="form.ms"
          type="number"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template v-else-if="command.type === 'layer_set'">
      <GalField label="图层" sub-label="Layer">
        <input
          v-model="form.layer"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
      <GalField label="属性 (JSON)" sub-label="Props">
        <textarea
          v-model="form.layerPropsJson"
          class="gal-textarea text-xs font-mono"
          style="min-height: 60px"
          @input="queueApply()"
        ></textarea>
      </GalField>
    </template>
    <template v-else-if="command.type === 'emit'">
      <GalField label="事件名" sub-label="Event">
        <input
          v-model="form.event"
          class="gal-input text-xs py-1.5"
          @input="queueApply()"
        />
      </GalField>
    </template>
    <template
      v-else-if="
        command.type === 'clear_dialogue' ||
        command.type === 'bgm_stop' ||
        command.type === 'return' ||
        command.type === 'transition' ||
        command.type === 'autosave' ||
        command.type === 'label'
      "
    >
      <div class="text-xs opacity-40 py-2">该指令无需配置参数</div>
    </template>
    <template v-else>
      <div class="text-[10px] uppercase tracking-widest opacity-50">
        Payload
      </div>
      <pre
        class="text-[12px] opacity-70 bg-black/5 p-3 rounded-2xl overflow-x-auto m-0 whitespace-pre-wrap"
        >{{ JSON.stringify(command.payload, null, 2) }}</pre
      >
    </template>
    <div class="pt-2 mt-1 border-t border-current/10">
      <span class="text-[10px] uppercase tracking-widest opacity-40">Next</span>
      <span class="text-xs ml-2 opacity-60">{{
        command.next || '顺序执行'
      }}</span>
    </div>
  </div>
</template>
