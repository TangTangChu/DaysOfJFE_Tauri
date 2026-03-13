import type { AudioState } from '../../shared/types/engine'

export type AudioChannel = 'bgm' | 'voice' | 'sfx' | 'ui'

export interface AudioPlayRequest {
  channel: AudioChannel
  key: string
  loop?: boolean
  volume?: number
  fadeInMs?: number
}

export interface AudioStopRequest {
  channel: AudioChannel
  fadeOutMs?: number
}

export class AudioBus {
  private readonly elements: Partial<Record<AudioChannel, HTMLAudioElement>> =
    {}
  private readonly state: AudioState

  constructor(state: AudioState) {
    this.state = state
  }

  async play(req: AudioPlayRequest): Promise<void> {
    const prev = this.elements[req.channel]
    if (prev && prev !== undefined) {
      prev.pause()
      prev.currentTime = 0
    }

    const audio = new Audio(req.key)
    audio.loop = !!req.loop
    audio.volume = this.resolveVolume(req.channel, req.volume ?? 1)

    this.elements[req.channel] = audio
    this.state.channels[req.channel].currentKey = req.key
    this.state.channels[req.channel].playing = true

    if (req.fadeInMs && req.fadeInMs > 0) {
      audio.volume = 0
      await audio.play().catch(() => undefined)
      await this.fadeChannel(
        req.channel,
        this.resolveVolume(req.channel, req.volume ?? 1),
        req.fadeInMs,
      )
      return
    }

    await audio.play().catch(() => undefined)
  }

  async stop(req: AudioStopRequest): Promise<void> {
    const audio = this.elements[req.channel]
    if (!audio) return

    if (req.fadeOutMs && req.fadeOutMs > 0) {
      await this.fadeChannel(req.channel, 0, req.fadeOutMs)
    }

    audio.pause()
    audio.currentTime = 0
    this.state.channels[req.channel].playing = false
    this.state.channels[req.channel].currentKey = null
  }

  setVolume(channel: AudioChannel, volume: number): void {
    this.state.channels[channel].volume = volume
    const audio = this.elements[channel]
    if (audio) {
      audio.volume = this.resolveVolume(channel, 1)
    }
  }

  async fade(
    channel: AudioChannel,
    to: number,
    durationMs: number,
  ): Promise<void> {
    await this.fadeChannel(channel, to, durationMs)
  }

  getState(): AudioState {
    return structuredClone(this.state)
  }

  private resolveVolume(channel: AudioChannel, localVolume: number): number {
    if (this.state.muted) return 0
    const channelVolume = this.state.channels[channel].volume
    return Math.max(
      0,
      Math.min(1, this.state.master * channelVolume * localVolume),
    )
  }

  private async fadeChannel(
    channel: AudioChannel,
    to: number,
    durationMs: number,
  ): Promise<void> {
    const audio = this.elements[channel]
    if (!audio) return

    const steps = 20
    const from = audio.volume
    const diff = to - from
    const interval = Math.max(1, Math.floor(durationMs / steps))

    for (let i = 1; i <= steps; i += 1) {
      audio.volume = from + (diff * i) / steps
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  }
}
