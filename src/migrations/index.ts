import * as migration_20260720_095859_initial from './20260720_095859_initial';

export const migrations = [
  {
    up: migration_20260720_095859_initial.up,
    down: migration_20260720_095859_initial.down,
    name: '20260720_095859_initial'
  },
];
