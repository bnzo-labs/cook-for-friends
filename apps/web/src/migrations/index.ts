import * as migration_20261017_124119 from './20261017_124119';
import * as migration_20261017_174125_0001_init from './20261017_174125_0001_init';
import * as migration_20261017_183746_0002_auth_rate_limits from './20261017_183746_0002_auth_rate_limits';
import * as migration_20261018_114002_sessions_version from './20261018_114002_sessions_version';
import * as migration_20261020_004708_w2_multi_seat_course_status from './20261020_004708_w2_multi_seat_course_status';
import * as migration_20261031_220248_w2_jobs_send_email from './20261031_220248_w2_jobs_send_email';
import * as migration_20261108_171630_w2_jobs_stripe_sync from './20261108_171630_w2_jobs_stripe_sync';
import * as migration_20261109_070649_w3_schema from './20261109_070649_w3_schema';
import * as migration_20261114_130258_w4_security from './20261114_130258_w4_security';

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
    name: '20261017_183746_0002_auth_rate_limits',
  },
  {
    up: migration_20261018_114002_sessions_version.up,
    down: migration_20261018_114002_sessions_version.down,
    name: '20261018_114002_sessions_version',
  },
  {
    up: migration_20261020_004708_w2_multi_seat_course_status.up,
    down: migration_20261020_004708_w2_multi_seat_course_status.down,
    name: '20261020_004708_w2_multi_seat_course_status',
  },
  {
    up: migration_20261031_220248_w2_jobs_send_email.up,
    down: migration_20261031_220248_w2_jobs_send_email.down,
    name: '20261031_220248_w2_jobs_send_email',
  },
  {
    up: migration_20261108_171630_w2_jobs_stripe_sync.up,
    down: migration_20261108_171630_w2_jobs_stripe_sync.down,
    name: '20261108_171630_w2_jobs_stripe_sync',
  },
  {
    up: migration_20261109_070649_w3_schema.up,
    down: migration_20261109_070649_w3_schema.down,
    name: '20261109_070649_w3_schema',
  },
  {
    up: migration_20261114_130258_w4_security.up,
    down: migration_20261114_130258_w4_security.down,
    name: '20261114_130258_w4_security'
  },
];
