import _ from 'lodash';
import { Dialect, Sequelize } from 'sequelize';

import { dialects } from './../dialects/dialects';
import { AutoBuilder } from './auto-builder';
import { AutoGenerator } from './auto-generator';
import { AutoRelater } from './auto-relater';
import { AutoWriter } from './auto-writer';
import { AutoOptions, getYYYYMMDDHHMMSS, TableData } from './types';
export class SequelizeAbsMigrate {
  sequelize: Sequelize;
  options: AutoOptions;

  constructor(
    database: string | Sequelize,
    username: string,
    password: string,
    options: AutoOptions,
  ) {
    if (database instanceof Sequelize) {
      this.sequelize = database;
    } else {
      this.sequelize = new Sequelize(database, username, password, options || {});
    }
    if (options.migrationTimestamp) {
      if (options.migrationTimestamp.toString().length !== 14) {
        options.migrationTimestamp = getYYYYMMDDHHMMSS();
      }
    } else {
      options.migrationTimestamp = getYYYYMMDDHHMMSS();
    }

    this.options = _.extend(
      {
        spaces: true,
        indentation: 2,
        directory: './models',
        additional: {},
        host: 'localhost',
        port: this.getDefaultPort(options.dialect),
        closeConnectionAutomatically: true,
      },
      options || {},
    );

    if (!this.options.directory) {
      this.options.noWrite = true;
    }
  }

  async run(): Promise<TableData> {
    let td = await this.build();
    let type = {};
    td = this.relate(td);

    // // write the individual model files
    // let timestamp = getYYYYMMDDHHMMSS();
    // if(this.options.migrationTimestamp) {
    //   timestamp = this.options.migrationTimestamp;
    // }

    const tt = this.generateMigration(td, type);
    td.text = tt;
    await this.write(td, type);

    // generate forignkey migrations
    type = {
      forignKeys: true,
    };
    const tg = this.generateConstraint(td, type);
    td.text = tg;
    await this.write(td, type);

    return td;
  }

  build(): Promise<TableData> {
    const builder = new AutoBuilder(this.sequelize, this.options);
    return builder.build().then((tableData) => {
      if (this.options.closeConnectionAutomatically) {
        return this.sequelize.close().then(() => tableData);
      }
      return tableData;
    });
  }

  relate(td: TableData): TableData {
    const relater = new AutoRelater(this.options);
    return relater.buildRelations(td);
  }

  generateMigration(tableData: TableData, type: any) {
    const dialect = dialects[this.sequelize.getDialect() as Dialect];
    const generator = new AutoGenerator(tableData, dialect, this.options, type);
    return generator.generateMigration();
  }

  generateConstraint(tableData: TableData, type: any) {
    const dialect = dialects[this.sequelize.getDialect() as Dialect];
    const generator = new AutoGenerator(tableData, dialect, this.options, type);
    return generator.generateConstraint();
  }

  write(tableData: TableData, type: any) {
    const writer = new AutoWriter(tableData, this.options, type);
    return writer.write();
  }

  getDefaultPort(dialect?: Dialect) {
    switch (dialect) {
      case 'postgres':
        return 5432;
      default:
        return 3306;
    }
  }
}
module.exports = SequelizeAbsMigrate;
module.exports.SequelizeAbsMigrate = SequelizeAbsMigrate;
module.exports.default = SequelizeAbsMigrate;
