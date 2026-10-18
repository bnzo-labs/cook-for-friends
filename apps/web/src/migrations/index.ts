import * as migration_20261017_124119 from './20261017_124119';
import * as migration_20261017_174125_0001_init from './20261017_174125_0001_init';
import * as migration_20261017_183746_0002_auth_rate_limits from './20261017_183746_0002_auth_rate_limits';

export const migrations = [
  {
    up: migration_20261017_124119.up,
    down: migration_20261017_124119.down,
    name: '20261017_124119',
  },
  {
    up: migration_20261017_174125_0001_init.up,
    down: migration_20261017_174125_0001_init.down,
    name: '20261017_174125_0001_init',
  },
  {
    up: migration_20261017_183746_0002_auth_rate_limits.up,
    down: migration_20261017_183746_0002_auth_rate_limits.down,
    name: '20261017_183746_0002_auth_rate_limits'
  },
];
