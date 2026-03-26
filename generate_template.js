const fs = require('fs');

const template = `
<template>
  <div class="relative w-full h-screen overflow-hidden bg-gal-bg-base flex flex-col font-sans">
    <!-- 1. 顶部：全局工具栏 (Top App Bar) -->
    <header class="shrink-0 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 bg-(--color-md-surface-container) border-b border-(--color-md-outline-variant) z-20">
      <div class="flex items-center gap-4">
        <h1 class="font-serif text-xl font-extrabold text-gal-text tracking-[0.15em] m-0 inline-flex items-center gap-2">
          剧本编辑
        </h1>
        <div class="h-6 w-[1px] bg-(--color-md-outline-variant) mx-2 hidden sm:block"></div>
        <!-- File Actions -->
        <div class="flex items-center gap-2">
          <GalButton text="新建" layout="horizontal" @click="loadTemplate" />
          <select class="gal-select text-xs py-1" @change="handleSampleSelect">
            <option value="" disabled selected>载入示例</option>
            <option v-for="id in scriptIds" :key="id" :value="id">{{ id }}</option>
          </select>
          <GalButton text="读取" layout="horizontal" @click="loadLocal" />
          <GalButton text="保存" layout="horizontal" @click="saveLocal" />
          <GalButton text="导出" layout="horizontal" @click="downloadScript" />
        </div>
      </div>

      <div class="flex items-center gap-4">
        <!-- Tools Actions -->
        <div class="flex items-center gap-2">
          <GalButton text="格式化" layout="horizontal" @click="formatScript" />
          <GalButton text="分析" layout="horizontal" @click="refreshAnalysis" />
          <GalButton text="清空" layout="horizontal" @click="showConfirm('清空脚本', '确定要清空当前内容吗？', () => { setRaw('') })" />
        </div>
        <div class="h-6 w-[1px] bg-(--color-md-outline-variant) mx-2 hidden lg:block"></div>
        <!-- Session Info -->
        <div class="flex items-center gap-2 text-xs">
          <span class="gal-chip hidden xl:inline-flex">{{ metaForm.title || '未命名剧本' }}</span>
          <GalTag :text="statusSummary" />
          <GalButton text="返回标题" layout="horizontal" @click="back" />
        </div>
      </div>
    </header>

    <!-- 主体：三栏式工作区 -->
    <div class="flex-1 flex overflow-hidden p-4 gap-4">
      
      <!-- 2. 左侧：资源与大纲栏 (Left Sidebar) -->
      <aside class="w-64 lg:w-72 shrink-0 flex flex-col gap-4 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
        
        <!-- 剧本信息 -->
        <div class="gal-panel p-4 flex flex-col gap-3">
          <div class="text-sm font-semibold tracking-[0.1em] text-(--color-md-on-surface)">剧本属性</div>
          <GalField label="ID" sub-label="Script">
            <input v-model="metaForm.scriptId" class="gal-input text-xs py-1" @blur="applyMeta" />
          </GalField>
          <GalField label="标题" sub-label="Title">
            <input v-model="metaForm.title" class="gal-input text-xs py-1" @blur="applyMeta" />
          </GalField>
        </div>

        <!-- 场景大纲 -->
        <div class="gal-panel flex-1 min-h-0 flex flex-col overflow-hidden">
          <div class="p-4 shrink-0 border-b border-(--color-md-outline-variant)">
            <div class="text-sm font-semibold tracking-[0.1em] flex justify-between items-center">
              <span>场景大纲</span>
              <GalTag :text="String(sceneList.length)" />
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-2 custom-scrollbar">
            <button
              v-for="scene in sceneList"
              :key="scene.id"
              class="w-full text-left rounded-[16px] border border-transparent px-3 py-3 transition-all duration-200 bg-(--color-md-surface-container-low) hover:bg-(--color-md-surface-container-high) cursor-pointer"
              :class="activeScene?.id === scene.id ? '!border-(--color-md-primary) !bg-(--color-md-primary-container) text-(--color-md-on-primary-container)' : ''"
              @click="activeSceneId = scene.id"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-semibold tracking-[0.1em] truncate">{{ scene.title }}</div>
                  <div class="text-[10px] opacity-75 mt-1 truncate">{{ scene.id }}</div>
                </div>
                <GalTag :text="String(scene.commands.length)" />
              </div>
            </button>
            <div v-if="!sceneList.length" class="text-xs text-gal-text-sub text-center py-4">无场景</div>
          </div>
        </div>

        <!-- 总览数据 -->
        <div class="gal-panel p-4 grid grid-cols-2 gap-2 shrink-0">
          <div><div class="text-[10px] text-gal-text-sub">指令总数</div><div class="text-sm font-bold">{{ sceneCommandCount }}</div></div>
          <div><div class="text-[10px] text-gal-text-sub">变量</div><div class="text-sm font-bold">{{ doc ? Object.keys(doc.variables ?? {}).length : 0 }}</div></div>
        </div>
      </aside>

      <!-- 3. 中央：剧本核心编辑区 (Main Workspace) -->
      <main class="flex-1 min-w-0 flex flex-col gap-0 bg-(--color-md-surface-container-lowest) rounded-[24px] border border-(--color-md-outline-variant) overflow-hidden shadow-sm">
        
        <!-- 中央控制头 -->
        <div class="shrink-0 px-4 py-3 bg-(--color-md-surface-container-low) border-b border-(--color-md-outline-variant) flex items-center justify-between">
          <div class="flex items-center gap-3">
            <GalSegmented v-model="viewMode" :items="viewItems" />
          </div>
          <div class="text-xs text-gal-text-sub tracking-wider">
            <span v-if="viewMode === 'editor'">字符数: {{ rawText.length }}</span>
            <span v-if="viewMode === 'structure'">当前场景: {{ activeScene?.id || '未选择' }}</span>
          </div>
        </div>

        <!-- 编辑区内容 -->
        <div class="flex-1 min-h-0 overflow-hidden relative">
          
          <!-- Code Editor View -->
          <div v-if="viewMode === 'editor'" class="absolute inset-0">
            <textarea
              ref="editorRef"
              v-model="rawText"
              class="w-full h-full p-6 font-mono text-[13px] tracking-[0.05em] resize-none bg-transparent outline-none text-(--color-md-on-surface) custom-scrollbar"
              placeholder="在这里编写 YAML 剧本..."
              @dragover="handleEditorDragOver"
              @drop="handleEditorDrop"
            ></textarea>
            <div class="absolute right-4 bottom-4 z-10 text-[10px] text-gal-text-sub tracking-[0.14em] pointer-events-none opacity-50">
              拖入积木可快速插入
            </div>
          </div>

          <!-- Structure View -->
          <div v-else-if="viewMode === 'structure'" class="absolute inset-0 flex flex-col md:flex-row">
            <div class="w-full md:w-1/2 lg:w-72 flex flex-col border-r border-(--color-md-outline-variant)">
              <div class="p-3 shrink-0 flex flex-col gap-2 border-b border-(--color-md-outline-variant)">
                <input v-model="searchText" class="gal-input text-xs py-1.5" placeholder="搜索指令..." />
                <select v-model="commandTypeFilter" class="gal-select text-xs py-1.5">
                  <option value="all">全部类型</option>
                  <option v-for="type in typeOptions" :key="type" :value="type">{{ typeLabel(type) }}</option>
                </select>
              </div>
              <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-2 custom-scrollbar">
                <div
                  v-for="command in filteredCommands"
                  :key="command.id"
                  class="rounded-[16px] border border-transparent px-3 py-2 cursor-pointer transition-all bg-(--color-md-surface-container) hover:bg-(--color-md-surface-container-high)"
                  :class="activeCommand?.id === command.id ? '!border-(--color-md-primary) !bg-(--color-md-primary-container) text-(--color-md-on-primary-container)' : ''"
                  @click="activeCommandId = command.id"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="text-xs font-semibold truncate">{{ c
