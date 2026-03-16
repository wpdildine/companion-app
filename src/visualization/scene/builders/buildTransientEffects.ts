/**
 * Transient effects builder: copies shared transient definitions into scene.
 * Render layers interpret these; no runtime logic here.
 */

import { getTransientEffect } from '../artDirection/transientEffects';
import type { GLSceneTransientEffects } from '../sceneFormations';

export function buildTransientEffects(): GLSceneTransientEffects {
  return {
    softFail: getTransientEffect('softFail') ?? null,
    terminalFail: getTransientEffect('terminalFail') ?? null,
    firstToken: getTransientEffect('firstToken') ?? null,
    shortTap: getTransientEffect('shortTap') ?? null,
  };
}
