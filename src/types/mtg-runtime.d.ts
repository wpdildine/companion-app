import type { RouterMap } from '@atlas/runtime/dist/routerLoader';

declare module '@atlas/runtime' {
  export function getKeywordAbilities(
    routerMap: RouterMap,
  ): Record<string, { section: number; rule_prefix: string }>;

  export function getDefinitions(
    routerMap: RouterMap,
  ): Record<string, string[]>;

  export function getResolverThresholds(
    routerMap: RouterMap,
  ): Record<string, number>;

  export function getSectionDefaults(
    routerMap: RouterMap,
  ): Record<string, string[]>;

  export function getStopwords(routerMap: RouterMap): string[];
}

export {};
