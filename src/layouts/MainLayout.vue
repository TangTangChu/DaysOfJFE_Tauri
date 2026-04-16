<script setup lang="ts">
import { computed, type Component } from "vue";
import { useNavigator, type ScreenId } from "../app/navigator";
import HomePage from "../pages/HomePage.vue";
import GamePage from "../pages/GamePage.vue";
import SavesPage from "../pages/SavesPage.vue";
import SettingsPage from "../pages/SettingsPage.vue";
import EditorPage from "../pages/EditorPage.vue";

const { state } = useNavigator();

const screenMap: Record<ScreenId, Component> = {
    title: HomePage,
    game: GamePage,
    saves: SavesPage,
    settings: SettingsPage,
    backlog: HomePage,
    editor: EditorPage,
};

const currentComponent = computed(() => screenMap[state.current]);
const transitionName = computed(() => "fade");
</script>

<template>
    <div class="h-screen w-screen overflow-hidden bg-black text-white">
        <Transition :name="transitionName" mode="out-in">
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
