import type { CompiledScriptIR } from "./schema";

export type CompileResolver = (scriptId: string) => Promise<CompiledScriptIR>;

export class ScriptRegistry {
    private scripts = new Map<string, CompiledScriptIR>();
    private resolver: CompileResolver | null = null;

    register(ir: CompiledScriptIR): void {
        this.scripts.set(ir.scriptId, ir);
    }

    get(scriptId: string): CompiledScriptIR | null {
        return this.scripts.get(scriptId) ?? null;
    }

    has(scriptId: string): boolean {
        return this.scripts.has(scriptId);
    }

    async resolve(scriptId: string): Promise<CompiledScriptIR> {
        const cached = this.scripts.get(scriptId);
        if (cached) return cached;

        if (!this.resolver) {
            throw new Error(
                `REGISTRY_ERROR: no resolver set, cannot load "${scriptId}"`,
            );
        }

        const ir = await this.resolver(scriptId);
        this.scripts.set(ir.scriptId, ir);
        return ir;
    }

    setResolver(resolver: CompileResolver): void {
        this.resolver = resolver;
    }

    clear(): void {
        this.scripts.clear();
    }
}
