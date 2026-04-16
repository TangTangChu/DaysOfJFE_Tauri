<script setup lang="ts">
import { reactive, watch } from "vue";
import GalDropdown from "../ui/GalDropdown.vue";
import GalField from "../ui/GalField.vue";
import type { ScriptCommand } from "../../engine/script/schema";
import type { JsonValue } from "../../shared/types/engine";

interface AssetOption {
    id: string;
    label: string;
}

const props = defineProps<{
    command: ScriptCommand;
    assetOptions?: {
        backgrounds: AssetOption[];
        standees: AssetOption[];
        bgm: AssetOption[];
        voice: AssetOption[];
        sfx: AssetOption[];
    };
}>();

const emit = defineEmits<{
    (e: "update", patch: Record<string, JsonValue>): void;
}>();

const slotOptions = [
    { id: "left", label: "左 (left)" },
    { id: "center", label: "中 (center)" },
    { id: "right", label: "右 (right)" },
];

const interruptOptions = [
    { id: "interrupt", label: "打断 (interrupt)" },
    { id: "queue", label: "排队 (queue)" },
];

interface ChoiceOption {
    id: string;
    text: string;
    to: string;
}

const form = reactive({
    // text
    text: "",
    speakerId: "",
    speakerName: "",
    // character
    charId: "",
    slot: "",
    poseKey: "",
    // bg
    bgKey: "",
    // flow
    to: "",
    ifExpr: "",
    thenTarget: "",
    elseTarget: "",
    sceneId: "",
    entry: "",
    scriptId: "",
    endingKey: "",
    // variables
    key: "",
    value: "",
    by: "1",
    statement: "",
    // audio
    audioKey: "",
    interruptPolicy: "interrupt",
    // timing
    ms: "800",
    // emit
    event: "",
    // choice
    choiceId: "",
    prompt: "",
    options: [] as ChoiceOption[],
    // layer
    layer: "",
    layerPropsJson: "{}",
});

let applyTimer: number | null = null;

function str(v: JsonValue | undefined): string {
    if (v === null || v === undefined) return "";
    return String(v);
}

function syncForm() {
    const p = props.command.payload ?? {};
    form.text = str(p.text);
    form.speakerId = str(p.speakerId);
    form.speakerName = str(p.speakerName);
    form.charId = str(p.charId);
    form.slot = str(p.slot);
    form.poseKey = str(p.poseKey);
    form.bgKey = str(p.bgKey);
    form.to = str(p.to);
    form.ifExpr = str(p.if);
    form.thenTarget = str(p.then);
    form.elseTarget = str(p.else);
    form.sceneId = str(p.sceneId);
    form.entry = str(p.entry);
    form.scriptId = str(p.scriptId);
    form.endingKey = str(p.endingKey);
    form.key = str(p.key);
    form.value = str(p.value);
    form.by = str(p.by || "1");
    form.statement = str(p.statement);
    form.audioKey = str(p.key);
    form.interruptPolicy = str(p.interruptPolicy || "interrupt");
    form.ms = str(p.ms || "800");
    form.event = str(p.event);
    form.choiceId = str(p.choiceId);
    form.prompt = str(p.prompt);
    form.layer = str(p.layer);
    form.layerPropsJson = p.props ? JSON.stringify(p.props, null, 2) : "{}";

    // Parse options array
    const rawOpts = p.options;
    if (Array.isArray(rawOpts)) {
        form.options = rawOpts.map((o: JsonValue) => {
            const obj = o as Record<string, JsonValue>;
            return { id: str(obj.id), text: str(obj.text), to: str(obj.to) };
        });
    } else {
        form.options = [];
    }
}

function buildPatch(): Record<string, JsonValue> {
    const t = props.command.type;
    switch (t) {
        case "dialogue":
            return {
                text: form.text,
                speakerId: form.speakerId,
                speakerName: form.speakerName,
            };
        case "narration":
            return { text: form.text };
        case "clear_dialogue":
            return {};
        case "char_show": {
            const p: Record<string, JsonValue> = {
                charId: form.charId,
                slot: form.slot,
            };
            if (form.poseKey) p.poseKey = form.poseKey;
            return p;
        }
        case "char_hide":
            return { charId: form.charId };
        case "char_pose":
            return { charId: form.charId, poseKey: form.poseKey };
        case "bg_set":
            return { bgKey: form.bgKey };
        case "jump":
            return { to: form.to };
        case "branch":
            return {
                if: form.ifExpr,
                then: form.thenTarget,
                else: form.elseTarget,
            };
        case "call":
            return { sceneId: form.sceneId, entry: form.entry };
        case "script_jump":
            return { scriptId: form.scriptId, sceneId: form.sceneId };
        case "end":
            return form.endingKey ? { endingKey: form.endingKey } : {};
        case "set":
            return { key: form.key, value: parseAutoValue(form.value) };
        case "inc":
            return { key: form.key, by: Number(form.by) || 1 };
        case "dec":
            return { key: form.key, by: Number(form.by) || 1 };
        case "expr":
            return { statement: form.statement };
        case "bgm_play":
            return { key: form.audioKey };
        case "bgm_stop":
            return {};
        case "voice_play":
            return {
                key: form.audioKey,
                interruptPolicy: form.interruptPolicy,
            };
        case "sfx_play":
            return { key: form.audioKey };
        case "wait":
            return { ms: Number(form.ms) || 0 };
        case "choice_show":
            return {
                choiceId: form.choiceId,
                prompt: form.prompt,
                options: form.options.map((o) => ({
                    id: o.id,
                    text: o.text,
                    to: o.to,
                })),
            };
        case "layer_set": {
            let parsed: JsonValue = {};
            try {
                parsed = JSON.parse(form.layerPropsJson);
            } catch {
                /* keep empty */
            }
            return { layer: form.layer, props: parsed };
        }
        case "emit": {
            let payload: JsonValue = {};
            try {
                payload = JSON.parse(str(props.command.payload?.payload));
            } catch {
                /* empty */
            }
            return { event: form.event, payload };
        }
        default:
            return { ...props.command.payload };
    }
}

function parseAutoValue(v: string): JsonValue {
    if (v === "true") return true;
    if (v === "false") return false;
    if (v === "null") return null;
    const n = Number(v);
    if (!isNaN(n) && v.trim() !== "") return n;
    return v;
}

function applyNow() {
    if (applyTimer) {
        clearTimeout(applyTimer);
        applyTimer = null;
    }
    emit("update", buildPatch());
}

function queueApply() {
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = window.setTimeout(applyNow, 350);
}

function addOption() {
    form.options.push({
        id: `opt_${form.options.length + 1}`,
        text: "新选项",
        to: "",
    });
    applyNow();
}

function removeOption(index: number) {
    form.options.splice(index, 1);
    applyNow();
}

watch(() => props.command, syncForm, { immediate: true });

const commonInputClass =
    "w-full bg-transparent border-[1.5px] border-md-outline-variant rounded-[12px] px-[14px] py-[10px] text-md-on-surface font-inherit transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] outline-none focus:border-md-primary focus:bg-md-primary/5 placeholder:text-md-on-surface-variant/60";
const commonTextareaClass =
    commonInputClass + " min-h-[120px] resize-vertical leading-[1.6]";
</script>

<template>
    <div class="flex flex-col gap-3">
        <template v-if="command.type === 'dialogue'">
            <div class="grid grid-cols-2 gap-3">
                <GalField label="说话人 ID">
                    <input
                        v-model="form.speakerId"
                        :class="[commonInputClass, 'text-xs py-1.5']"
                        @input="queueApply()"
                    />
                </GalField>
                <GalField label="显示名称">
                    <input
                        v-model="form.speakerName"
                        :class="[commonInputClass, 'text-xs py-1.5']"
                        @input="queueApply()"
                    />
                </GalField>
            </div>
            <GalField label="对话内容">
                <textarea
                    v-model="form.text"
                    :class="[commonTextareaClass, 'text-xs min-h-20']"
                    @input="queueApply()"
                ></textarea>
            </GalField>
        </template>

        <template v-else-if="command.type === 'narration'">
            <GalField label="旁白内容">
                <textarea
                    v-model="form.text"
                    :class="[commonTextareaClass, 'text-xs min-h-20']"
                    @input="queueApply()"
                ></textarea>
            </GalField>
        </template>
        <template v-else-if="command.type === 'char_show'">
            <div class="grid grid-cols-2 gap-3">
                <GalField label="角色 ID">
                    <input
                        v-model="form.charId"
                        :class="[commonInputClass, 'text-xs py-1.5']"
                        @input="queueApply()"
                    />
                </GalField>
                <GalField label="出现位置">
                    <GalDropdown
                        v-model="form.slot"
                        :options="slotOptions"
                        size="sm"
                        @update:model-value="applyNow"
                    />
                </GalField>
            </div>
            <GalField label="立绘资源">
                <div class="flex flex-col gap-2">
                    <GalDropdown
                        v-if="props.assetOptions?.standees?.length"
                        v-model="form.poseKey"
                        :options="props.assetOptions.standees"
                        size="sm"
                        @update:model-value="applyNow"
                    />
                    <input
                        v-model="form.poseKey"
                        :class="[commonInputClass, 'text-xs py-1.5']"
                        placeholder="自定义资源键名..."
                        @input="queueApply()"
                    />
                </div>
            </GalField>
        </template>

        <template v-else-if="command.type === 'char_pose'">
            <GalField label="角色 ID">
                <input
                    v-model="form.charId"
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    @input="queueApply()"
                />
            </GalField>
            <GalField label="切换立绘">
                <div class="flex flex-col gap-2">
                    <GalDropdown
                        v-if="props.assetOptions?.standees?.length"
                        v-model="form.poseKey"
                        :options="props.assetOptions.standees"
                        size="sm"
                        @update:model-value="applyNow"
                    />
                    <input
                        v-model="form.poseKey"
                        :class="[commonInputClass, 'text-xs py-1.5']"
                        placeholder="自定义资源键名..."
                        @input="queueApply()"
                    />
                </div>
            </GalField>
        </template>
        <template v-else-if="command.type === 'char_hide'">
            <GalField label="角色 ID">
                <input
                    v-model="form.charId"
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    @input="queueApply()"
                />
            </GalField>
        </template>
        <template v-else-if="command.type === 'bg_set'">
            <GalField label="背景资源">
                <div class="flex flex-col gap-2">
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
                        :class="[commonInputClass, 'text-xs py-1.5']"
                        placeholder="自定义背景键名..."
                        @input="queueApply()"
                    />
                </div>
            </GalField>
        </template>
        <template v-else-if="command.type === 'choice_show'">
            <div class="grid grid-cols-2 gap-3">
                <GalField label="选项 ID">
                    <input
                        v-model="form.choiceId"
                        :class="[commonInputClass, 'text-xs py-1.5']"
                        @input="queueApply()"
                    />
                </GalField>
                <GalField label="提示文本">
                    <input
                        v-model="form.prompt"
                        :class="[commonInputClass, 'text-xs py-1.5']"
                        @input="queueApply()"
                    />
                </GalField>
            </div>
            <div class="mt-2">
                <div class="flex items-center justify-between mb-3">
                    <span
                        class="text-[12px] font-bold tracking-[0.05em] opacity-60"
                        >选项列表</span
                    >
                    <button
                        class="text-[10px] px-2.5 py-1 rounded-full bg-md-primary text-md-on-primary cursor-pointer hover:opacity-90 transition-opacity"
                        @click="addOption"
                    >
                        + 添加选项
                    </button>
                </div>
                <div class="flex flex-col gap-2">
                    <div
                        v-for="(opt, i) in form.options"
                        :key="i"
                        class="rounded-xl border border-md-outline-variant/10 bg-md-surface-container-high p-3 flex flex-col gap-2.5"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="text-[9px] font-bold tracking-widest uppercase opacity-30"
                                >选项 {{ i + 1 }}</span
                            >
                            <button
                                class="text-[9px] font-bold px-1.5 py-0.5 rounded-md cursor-pointer text-red-100 hover:bg-red-500 hover:text-white transition-colors"
                                @click="removeOption(i)"
                            >
                                移除
                            </button>
                        </div>
                        <div class="grid grid-cols-4 gap-2">
                            <div class="col-span-1">
                                <input
                                    v-model="opt.id"
                                    :class="[
                                        commonInputClass,
                                        'text-[11px] py-1 bg-white/50 dark:bg-black/20',
                                    ]"
                                    placeholder="ID"
                                    @input="queueApply()"
                                />
                            </div>
                            <div class="col-span-3">
                                <input
                                    v-model="opt.text"
                                    :class="[
                                        commonInputClass,
                                        'text-[11px] py-1 bg-white/50 dark:bg-black/20',
                                    ]"
                                    placeholder="显示文本"
                                    @input="queueApply()"
                                />
                            </div>
                        </div>
                        <input
                            v-model="opt.to"
                            :class="[
                                commonInputClass,
                                'text-[11px] py-1 bg-white/50 dark:bg-black/20',
                            ]"
                            placeholder="跳转至目标 ID (To)"
                            @input="queueApply()"
                        />
                    </div>
                </div>
            </div>
        </template>
        <template v-else-if="command.type === 'jump'">
            <GalField label="跳转至">
                <input
                    v-model="form.to"
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    placeholder="目标指令 ID"
                    @input="queueApply()"
                />
            </GalField>
        </template>
        <template v-else-if="command.type === 'branch'">
            <GalField label="判断条件">
                <input
                    v-model="form.ifExpr"
                    :class="[commonInputClass, 'text-xs py-1.5 font-mono']"
                    placeholder="JS 表达式..."
                    @input="queueApply()"
                />
            </GalField>
            <div class="grid grid-cols-2 gap-3">
                <GalField label="真值跳转(Then)">
                    <input
                        v-model="form.thenTarget"
                        :class="[commonInputClass, 'text-xs py-1.5']"
                        @input="queueApply()"
                    />
                </GalField>
                <GalField label="假值跳转(Else)">
                    <input
                        v-model="form.elseTarget"
                        :class="[commonInputClass, 'text-xs py-1.5']"
                        @input="queueApply()"
                    />
                </GalField>
            </div>
        </template>
        <template v-else-if="command.type === 'call'">
            <GalField label="目标场景" sub-label="Scene ID">
                <input
                    v-model="form.sceneId"
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    @input="queueApply()"
                />
            </GalField>
            <GalField label="入口指令" sub-label="Entry Command">
                <input
                    v-model="form.entry"
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    placeholder="可选"
                    @input="queueApply()"
                />
            </GalField>
        </template>
        <template v-else-if="command.type === 'script_jump'">
            <GalField label="目标脚本" sub-label="Script ID">
                <input
                    v-model="form.scriptId"
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    @input="queueApply()"
                />
            </GalField>
            <GalField label="目标场景" sub-label="Scene ID">
                <input
                    v-model="form.sceneId"
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    @input="queueApply()"
                />
            </GalField>
        </template>
        <template v-else-if="command.type === 'end'">
            <GalField label="结局标识" sub-label="Ending Key">
                <input
                    v-model="form.endingKey"
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    placeholder="可选"
                    @input="queueApply()"
                />
            </GalField>
        </template>
        <template v-else-if="command.type === 'set'">
            <GalField label="变量名" sub-label="Key">
                <input
                    v-model="form.key"
                    :class="[commonInputClass, 'text-xs py-1.5 font-mono']"
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
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    @input="queueApply()"
                />
            </GalField>
        </template>
        <template v-else-if="command.type === 'inc' || command.type === 'dec'">
            <GalField label="变量名" sub-label="Key">
                <input
                    v-model="form.key"
                    :class="[commonInputClass, 'text-xs py-1.5 font-mono']"
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
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    @input="queueApply()"
                />
            </GalField>
        </template>
        <template v-else-if="command.type === 'expr'">
            <GalField label="表达式" sub-label="Statement" hint="结果存入 _">
                <input
                    v-model="form.statement"
                    :class="[commonInputClass, 'text-xs py-1.5 font-mono']"
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
                    :class="[commonInputClass, 'text-xs py-1.5']"
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
                    :class="[commonInputClass, 'text-xs py-1.5']"
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
                    :class="[commonInputClass, 'text-xs py-1.5']"
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
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    @input="queueApply()"
                />
            </GalField>
        </template>
        <template v-else-if="command.type === 'layer_set'">
            <GalField label="图层" sub-label="Layer">
                <input
                    v-model="form.layer"
                    :class="[commonInputClass, 'text-xs py-1.5']"
                    @input="queueApply()"
                />
            </GalField>
            <GalField label="属性 (JSON)" sub-label="Props">
                <textarea
                    v-model="form.layerPropsJson"
                    :class="[commonTextareaClass, 'text-xs font-mono min-h-15']"
                    @input="queueApply()"
                ></textarea>
            </GalField>
        </template>
        <template v-else-if="command.type === 'emit'">
            <GalField label="事件名" sub-label="Event">
                <input
                    v-model="form.event"
                    :class="[commonInputClass, 'text-xs py-1.5']"
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
            <span class="text-[10px] uppercase tracking-widest opacity-40"
                >Next</span
            >
            <span class="text-xs ml-2 opacity-60">{{
                command.next || "顺序执行"
            }}</span>
        </div>
    </div>
</template>

<style scoped></style>
