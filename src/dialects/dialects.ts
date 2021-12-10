import { postgresOptions } from "./postgres";
import { DialectOptions } from "./dialect-options";
import { Dialect } from "sequelize";

export const dialects: { [name in Dialect]: DialectOptions } = {
  postgres: postgresOptions,
};
