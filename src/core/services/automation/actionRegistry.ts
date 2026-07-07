import type { Action } from './actionTypes.js';
import { AnnounceAction } from './actions/announce.js';
import { PurgeAction } from './actions/purge.js';

/**
 * Registry of all available actions. Keyed by action name.
 * Add new actions here to make them available to the trigger engine.
 */
export const actions: Map<string, Action> = new Map([
  [AnnounceAction.name, AnnounceAction],
  [PurgeAction.name, PurgeAction]
]);

/** Get an action by name. Returns undefined if not found. */
export function getAction(name: string): Action | undefined {
  return actions.get(name);
}

/**
 * List all registered action names and descriptions.
 */
export function listActions(): { name: string; description: string }[] {
  return Array.from(actions.values()).map((a) => ({
    name: a.name,
    description: a.description,
  }));
}
