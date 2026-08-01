import type { Client, Message } from '@fluxerjs/core';
import type Database from 'better-sqlite3';

export interface ToeContext {
  client: Client;
  db: Database.Database;
}

export interface ToeModule {
  name: string;
  description: string;
  prefixCommands: string[];
  init?: (ctx: ToeContext) => Promise<void> | void;
  execute: (message: Message, ctx: ToeContext, args: string[]) => Promise<void>;
  destroy?: () => Promise<void> | void;
}
