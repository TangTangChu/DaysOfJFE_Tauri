<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useNavigator, type ScreenId } from '../app/navigator'
import HomePage from '../pages/HomePage.vue'
import GamePage from '../pages/GamePage.vue'
import SavesPage from '../pages/SavesPage.vue'
import SettingsPage from '../pages/SettingsPage.vue'

const { state } = useNavigator()

const screenMap: Record<ScreenId, Component> = {
  title: HomePage,
  game: GamePage,
  saves: SavesPage,
  settings: SettingsPage,
  backlog: HomePage,
}

const currentComponent = computed(() => screenMap[state.current])
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-black text-white">
    <Transition name="fade" mode="out-in">
      <KeepAlive :include="['GamePage']">
        <component :is="currentComponent" :key="state.current" />
      </KeepAlive>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
