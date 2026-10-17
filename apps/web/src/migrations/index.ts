import * as migration_20261017_124119 from './20261017_124119';
import * as migration_20261017_174125_0001_init from './20261017_174125_0001_init';

export const migrations = [
  {
    up: migration_20261017_124119.up,
    down: migration_20261017_124119.down,
    name: '20261017_124119',
  },
  {
    up: migration_20261017_174125_0001_init.up,
    down: migration_20261017_174125_0001_init.down,
    name: '20261017_174125_0001_init'
  },
];
