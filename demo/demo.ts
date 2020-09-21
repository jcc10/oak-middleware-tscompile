import { Application, send } from "https://deno.land/x/oak/mod.ts";
import { TsCompile } from "./../mod.ts";

const app = new Application();

// Logger
app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.headers.get("X-Response-Time");
  console.log(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
});

// Timing
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
});

let tsMiddle = new TsCompile({
  tscExt: true,
  matchingDir: /\/script\/(.*)/,
  fileRoot: `${Deno.cwd()}/client-ts`,
  cache: true,
  userRecompile: true,
  debug: false
});

app.use((ctx, nxt) => tsMiddle.middleware(ctx, nxt));

// app.use(async (ctx, next) => {
//   console.log(ctx.request.url.href)
//   if(ctx.request.url.href == "/dev/cache/clear"){
//     tsMiddle.cache.clear();
//     ctx.response.body = "Dev cache cleared.";
//   } else {
//     await next();
//   }
// });

app.use(async (context) => {
  await send(context, context.request.url.pathname, {
    root: `${Deno.cwd()}/static`,
    index: "index.html",
  });
});



await app.listen({ port: 8000 });