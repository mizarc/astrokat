/**
 * Context passed to every action when it executes.
 *
 * Platform-agnostic fields are always present. Platform-specific client
 * references are injected by the engine before dispatch so actions can
 * interact with the platform without knowing which one it is.
 */
export interface ActionContext {
  guildId: string;
  channelId: string;
  config: Record<string, unknown>;
  platform: 'discord' | 'fluxer';

  /** Send a textual reply (used by !tasks run for feedback). */
  reply?: (content: string) => Promise<void>;

  /** Resolved channel object set by the engine before dispatch. */
  channel?: any;

  /** Platform-specific client. Only set for actions that need it. */
  discordClient?: any;
  fluxerClient?: any;

  /** Platform-agnostic send function. */
  sendToChannel?: (payload: string | { content?: string; embeds?: any[] }) => Promise<any>;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface Action {
  /** Unique action identifier. */
  name: string;
  /** Human-readable description shown in help text. */
  description: string;
  /** Config keys required for this action to execute (e.g. ['message'] for announce). */
  requiredConfig?: string[];
  /** Execute the action. */
  execute(context: ActionContext): Promise<ActionResult>;
}
