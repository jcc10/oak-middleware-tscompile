import type { Context, Middleware } from "https://deno.land/x/oak/mod.ts"
import type { DenoStdInternalError } from "https://deno.land/std@0.69.0/_util/assert.ts";

const tscExt = /(.*\.)tsc/;
const jsExt = /(.*\.)js/;

interface tscompileOptions {
    tscExt?: boolean,
    jsExt?: boolean,
    matchingDir: RegExp,
    fileRoot: string,
    cache?: boolean,
    userRecompile?: boolean,
    debug?: boolean,
}

export function tscompileMiddleware(options: tscompileOptions): Middleware {

    const cache: Map<string, [number, string]> = new Map<string, [number, string]>();

    let tscTest: (path: string) => string | null;
    let jsTest: (path: string) => string | null;

    if(options.tscExt){
        tscTest = (path) => {
            let matchExt = path.match(tscExt);
            if (matchExt && matchExt[1]) {
                let matchPath = matchExt[1].match(options.matchingDir);
                if (matchPath && matchPath[1]) {
                    let file = `${options.fileRoot}/${matchPath[1]}ts`;
                    return file;
                }
            }
            return null;
        }
    } else {
        tscTest = () => {return null};
    }

    if (options.tscExt) {
        jsTest = (path) => {
            let matchExt = path.match(jsExt);
            if (matchExt && matchExt[1]) {
                let matchPath = matchExt[1].match(options.matchingDir);
                if (matchPath && matchPath[1]) {
                    let file = `${options.fileRoot}/${matchPath[1]}ts`;
                    return file;
                }
            }
            return null;
        }
    } else {
        jsTest = () => {return null};
    }

    let genResp: (file: string, ctx: Context) => Promise<string>;
    if(options.cache){
        genResp = async (file, ctx) => {
            let cached = cache.get(file);
            let v = ctx.request.url.searchParams.get("v");
            if (!cached) {
                const [diagnostics, emit] = await Deno.bundle(file);
                cached = [Date.now(), emit]
                cache.set(file, cached);
            }
            return cached[1];
        }
    } else {
        genResp = async (file, ctx) => {
            const [diagnostics, emit] = await Deno.bundle(file);
            return emit;
        }
    }

    return async function middleware(
        ctx: Context,
        next: () => Promise<void>
    ): Promise<void> {
        let path = ctx.request.url.href;
        if (options.matchingDir.test(path)) {
            let file: string | null = null;
            file = file || tscTest(path);
            file = file || jsTest(path);
            if(file){
                let emit = genResp(file, ctx);
                ctx.response.body = emit;
                ctx.response.type = "application/ecmascript";
                return;
            }
        }
        return next();
    };
}

declare type tester = (path: string) => string | null;
interface cacheItem {
    timestamp: number,
    emit: string,
    diag: Array<Deno.DiagnosticItem> | undefined
}

export class TsCompile {
    public cache: Map<string, cacheItem> = new Map<string, cacheItem>();
    private tscTester: tester = () => { return null };
    private jsTester: tester = ()=>{return null};
    private debug = (ctx: Context, debug: Array<Deno.DiagnosticItem> | undefined): void => {};
    private compiler: (file: string, v: number) => Promise<cacheItem> = async() => {return {timestamp: 0, emit: "", diag: undefined}};
    public options: tscompileOptions;

    constructor(options: tscompileOptions) {
        this.options = options;
        this.refresh();
    }

    public refresh() {
        this.tscMode();
        this.jsMode();
        this.compileMode();
        this.debugMode();
    }

    public async middleware(
        ctx: Context,
        next: () => Promise<void>): Promise<void> {
        let path = ctx.request.url.href.match(this.options.matchingDir);
        if (path && path[1]) {
            let file: string | null = null;
            file = file || this.tscTester(path[1]);
            file = file || this.jsTester(path[1]);
            if (file) {
                let v = parseInt(ctx.request.url.searchParams.get("v") || "0");
                let bundle = await this.compiler(`${this.options.fileRoot}/${file}ts`, v);
                this.debug(ctx, bundle.diag);
                ctx.response.body = bundle.emit;
                ctx.response.type = "application/ecmascript";
                return;
            }
        }
        return next();
    }

    public tscMode() {
        if (this.options.tscExt) {
            this.tscTester = (path) => {
                let matchExt = path.match(tscExt);
                if (matchExt && matchExt[1]) {
                    return matchExt[1];
                }
                return null;
            }
        } else {
            this.tscTester = () => { return null };
        }
    }

    public jsMode() {
        if (this.options.jsExt) {
            this.jsTester = (path) => {
                let matchExt = path.match(jsExt);
                if (matchExt && matchExt[1]) {
                    return matchExt[1];
                }
                return null;
            }
        } else {
            this.jsTester = () => { return null };
        }
    }
    
    public debugMode() {
        if(this.options.debug){
            this.debug = (ctx, debug) => {
                if (debug) {
                    ctx.response.headers.set("X-Compile-Error", "true");
                    console.log(debug);
                }
            }
        } else {
            this.debug = () => {};
        }
    }

    public compileMode()  {
        
        const {cache, userRecompile} = this.options;
        if(cache && userRecompile){
            this.compiler = async (file, v) => {
                let cached: cacheItem | undefined = this.cache.get(file);
                if (!cached || (cached.timestamp < v)) {
                    const [diag, emit] = await Deno.bundle(file);
                    cached = { timestamp: Date.now(), emit, diag };
                    this.cache.set(file, cached);
                }
                return cached;
            }
        } else if(cache && !userRecompile){
            this.compiler = async (file, v) => {
                let cached: cacheItem | undefined = this.cache.get(file);
                if (!cached) {
                    const [diag, emit] = await Deno.bundle(file);
                    cached = { timestamp: Date.now(), emit, diag };
                    this.cache.set(file, cached);
                }
                return cached;
            }
        } else {
            this.compiler = async (file, v) => {
                const [diag, emit] = await Deno.bundle(file);
                let cached = { timestamp: Date.now(), emit, diag };
                return cached;
            }
        }
    }

}