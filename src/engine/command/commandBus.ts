import type { IRCommand, ScriptCommandType } from '../script/schema'

export type CommandHandler<TContext> = (
  command: IRCommand,
  context: TContext,
) => Promise<void> | void

export class CommandBus<TContext> {
  private readonly handlers = new Map<
    ScriptCommandType,
    CommandHandler<TContext>
  >()

  register(type: ScriptCommandType, handler: CommandHandler<TContext>): void {
    this.handlers.set(type, handler)
  }

  async execute(command: IRCommand, context: TContext): Promise<void> {
    const handler = this.handlers.get(command.type)
    if (!handler) {
      throw new Error(`SCRIPT_COMMAND_NOT_FOUND:${command.type}`)
    }
    await handler(command, context)
  }
}
