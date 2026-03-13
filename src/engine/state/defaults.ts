import type {
  AudioState,
  DialogueState,
  EngineState,
  GameSettings,
  StageState,
} from '../../shared/types/engine'

export function createDefaultSettings(): GameSettings {
  return {
    audio: {
      master: 1,
      bgm: 0.8,
      voice: 0.8,
      sfx: 0.8,
      mute: false,
    },
    text: {
      fontFamily: 'Sarasa UI SC',
      fontSize: 28,
      lineHeight: 1.5,
      textSpeed: 24,
      autoDelayMs: 1200,
    },
    transition: {
      enabled: true,
      speedRate: 1,
    },
    input: {
      keymap: {
        'engine.next': { code: 'Space' },
        'save.quick': { code: 'KeyS', ctrl: true },
        'load.quick': { code: 'KeyL', ctrl: true },
        'engine.auto.toggle': { code: 'KeyA' },
      },
    },
    system: {
      skipReadOnly: false,
      autoModeInterruptOnChoice: true,
    },
  }
}

export function createDefaultDialogueState(): DialogueState {
  return {
    visible: true,
    mode: 'narration',
    speakerId: null,
    speakerName: null,
    textRaw: '',
    textRendered: '',
    typing: {
      active: false,
      cursor: 0,
      speed: 24,
      completed: true,
    },
    backlog: [],
  }
}

export function createDefaultStageState(): StageState {
  return {
    backgroundKey: null,
    layers: {},
    characters: {},
  }
}

export function createDefaultAudioState(): AudioState {
  return {
    master: 1,
    muted: false,
    channels: {
      bgm: { currentKey: null, playing: false, volume: 1 },
      voice: { currentKey: null, playing: false, volume: 1 },
      sfx: { currentKey: null, playing: false, volume: 1 },
      ui: { currentKey: null, playing: false, volume: 1 },
    },
  }
}

export function createInitialEngineState(settings: GameSettings): EngineState {
  return {
    runtime: {
      scriptId: '',
      sceneId: '',
      commandIndex: -1,
      commandId: '',
      tick: 0,
      paused: true,
    },
    stage: createDefaultStageState(),
    dialogue: createDefaultDialogueState(),
    choice: {
      open: false,
      choiceId: null,
      prompt: '',
      options: [],
    },
    variables: {},
    audio: createDefaultAudioState(),
    settings,
    save: {
      latestSlot: null,
      latestKind: null,
      latestTimestamp: null,
    },
    flags: {
      autoMode: false,
      fastForward: false,
      uiHidden: false,
    },
  }
}
