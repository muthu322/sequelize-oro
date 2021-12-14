import { Dialect } from 'sequelize';

import { DialectOptions } from './dialect-options';
import { postgresOptions } from './postgres';

export const dialects: { [name in Dialect]: DialectOptions } = {
  postgres: postgresOptions,
};
