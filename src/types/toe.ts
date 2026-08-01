import type { Client, Message } from '@fluxerjs/core';
import type { DatabaseSync } from 'node:sqlite';

export interface ToeContext {
  client: Client;
  db: DatabaseSync;
}

export interface ToeModule {
  name: string;
  description: string;
  help: string;
  prefixCommands: string[];
  init?: (ctx: ToeContext) => Promise<void> | void;
  execute: (message: Message, ctx: ToeContext, args: string[]) => Promise<void>;
  destroy?: () => Promise<void> | void;
}
