import { createWorld } from "koota";
import { IsEnemy } from "./enemy/traits";
import * as enemyTraits from "./enemy/traits";
import { enemyActions } from "./enemy/actions";

export const world = createWorld();

// Exposed for debugging / e2e probes
if (typeof window !== "undefined") {
  (window as any).__world = world;
  (window as any).__IsEnemy = IsEnemy;
  (window as any).__ecs = {
    world,
    traits: enemyTraits,
    enemyActions: enemyActions(world),
  };
}
