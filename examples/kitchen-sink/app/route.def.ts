import { defineAppRoute } from "paramour";

// A static route: no dynamic segments, so `defineAppRoute` REJECTS a `params`
// config (RouteConfig's static-path arm), and href(homeRoute) needs no options.
export const homeRoute = defineAppRoute("/", {});
