// <define:__ROUTES__>
var define_ROUTES_default = {
  version: 1,
  include: ["/api", "/api/*"],
  exclude: []
};

// C:/Users/ANSHU KUMAR/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-dev-pipeline.ts
import worker from "H:\\pro_fitness_gym\\.wrangler\\tmp\\pages-fN8evx\\functionsWorker-0.48918800995121425.mjs";
import { isRoutingRuleMatch } from "C:\\Users\\ANSHU KUMAR\\AppData\\Local\\npm-cache\\_npx\\32026684e21afda6\\node_modules\\wrangler\\templates\\pages-dev-util.ts";
export * from "H:\\pro_fitness_gym\\.wrangler\\tmp\\pages-fN8evx\\functionsWorker-0.48918800995121425.mjs";
var routes = define_ROUTES_default;
var pages_dev_pipeline_default = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    for (const exclude of routes.exclude) {
      if (isRoutingRuleMatch(pathname, exclude)) {
        return env.ASSETS.fetch(request);
      }
    }
    for (const include of routes.include) {
      if (isRoutingRuleMatch(pathname, include)) {
        const workerAsHandler = worker;
        if (workerAsHandler.fetch === void 0) {
          throw new TypeError("Entry point missing `fetch` handler");
        }
        return workerAsHandler.fetch(request, env, context);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  pages_dev_pipeline_default as default
};
//# sourceMappingURL=wwnxiiqm3ka.js.map
