import _ from 'lodash';
import { Dialect, QueryInterface, QueryTypes, Sequelize } from 'sequelize';

import {
  ColumnElementType,
  ColumnPrecision,
  DialectOptions,
  // FKRow,
  // FKSpec,
  TriggerCount,
} from './../dialects/dialect-options';
import { dialects } from './../dialects/dialects';
import { AutoGenerator } from './auto-generator';
import { AutoOptions } from './types';
import { Field, IndexSpec, Table, TableData } from './types';

/** Queries the database and builds the tables, foreignKeys, indexes, and hasTriggerTables structures in TableData  */
export class AutoBuilder {
  sequelize: Sequelize;
  queryInterface: QueryInterface;
  dialect: DialectOptions;
  includeTables?: string[];
  skipTables?: string[];
  schema?: string;
  views: boolean;
  tableData: TableData;
  options: AutoOptions;

  constructor(sequelize: Sequelize, options: AutoOptions) {
    this.sequelize = sequelize;
    this.queryInterface = this.sequelize.getQueryInterface();
    this.dialect = dialects[this.sequelize.getDialect() as Dialect];
    this.includeTables = options.tables;
    this.skipTables = options.skipTables;
    this.schema = options.schema;
    this.views = !!options.views;
    this.options = options;
    this.tableData = new TableData();
  }

  build(): Promise<TableData> {
    let prom: Promise<any[]>;
    if (this.dialect.showTablesQuery) {
      const showTablesSql = this.dialect.showTablesQuery(this.schema);
      prom = this.executeQuery<string>(showTablesSql);
    } else {
      prom = this.queryInterface.showAllTables();
    }

    return prom
      .then((tr) => this.processTables(tr))
      .catch((err) => {
        console.error(err);
        return this.tableData;
      });
  }

  private processTables(tableResult: any[]) {
    // tables is an array of either three things:
    // * objects with two properties table_name and table_schema
    // * objects with two properties tableName and tableSchema
    // * objects with a single name property
    // The first happens for dialects which support schemas (e.g. mssql, postgres).
    // The second happens for dialects which do not support schemas (e.g. sqlite).

    let tables = _.map(tableResult, (t) => {
      return {
        table_name: t.table_name || t.tableName || t.name || String(t),
        table_schema: t.table_schema || t.tableSchema || t.schema || this.schema || null,
      } as Table;
    });

    // include/exclude tables
    if (this.includeTables) {
      const optables = mapOptionTables(this.includeTables, this.schema);
      tables = _.intersectionWith(tables, optables, isTableEqual);
    } else if (this.skipTables) {
      const skipTables = mapOptionTables(this.skipTables, this.schema);
      tables = _.differenceWith(tables, skipTables, isTableEqual);
    }

    // sort seeder tables
    let sortedCollection;
    if (this.options.orderTables) {
      const firstArray = this.options.orderTables;
      const last = tables.length;
      sortedCollection = _.sortBy(tables, function (item) {
        return firstArray.indexOf(item.table_name) !== -1
          ? firstArray.indexOf(item.table_name)
          : last;
      });
    } else if (this.options.tables) {
      const firstArray = this.options.tables;
      const last = tables.length;
      sortedCollection = _.sortBy(tables, function (item) {
        return firstArray.indexOf(item.table_name) !== -1
          ? firstArray.indexOf(item.table_name)
          : last;
      });
    } else {
      sortedCollection = tables;
    }

    const promises = sortedCollection.map(async (t) => {
      if (this.options.seederTimestamp) {
        this.options.seederTimestamp++;
        const timestamp = this.options.seederTimestamp;
        await this.getDataTable(t, timestamp);
      }
    });

    return Promise.all(promises).then(() => this.tableData);
  }

  private async getDataTable(table: Table, timestamp: number) {
    // const tableQname = makeTableQName(table);
    const limit = 0;
    let tableOptions = {};
    // console.log(this.options);
    if (this.options.tableOptions && this.options.tableOptions[table.table_name]) {
      tableOptions = this.options.tableOptions[table.table_name];
    }
    const triggerResult = await this.executeQuery<TriggerCount>(
      this.dialect.getTotalRows(
        table.table_name,
        table.table_schema || this.sequelize.getDatabaseName(),
        tableOptions,
      ),
    );
    const count = triggerResult && triggerResult[0] && triggerResult[0].trigger_count;
    let totalPages = 1;
    if (limit > 0) {
      totalPages = Math.ceil(count / limit);
    }
    const promises = [];
    for (let page = 1; page <= totalPages; page += 1) {
      const sql = this.dialect.getDataTable(
        table.table_name,
        'id',
        page - 1,
        limit,
        tableOptions,
        table.table_schema || this.sequelize.getDatabaseName(),
      );
      const data = await this.executeQuery(sql);
      let tableData = {
        tableName: table.table_name,
        tableSchema: table.table_schema,
        fields: await this.mapTable(table),
        timestamp,
      };
      // tableData = Object.assign(tableData, this.tableData);
      promises.push(this.generator(tableData, data));
    }
    return await Promise.all(promises);
  }

  private async mapTable(table: Table) {
    try {
      const fields = await this.queryInterface.describeTable(
        table.table_name,
        table.table_schema,
      );
      // this.tableData.tables[makeTableQName(table)] = fields;

      // for postgres array or user-defined types, get element type
      if (
        this.dialect.showElementTypeQuery &&
        (_.some(fields, { type: 'ARRAY' }) || _.some(fields, { type: 'USER-DEFINED' }))
      ) {
        // get the subtype of the fields
        const stquery = this.dialect.showElementTypeQuery(
          table.table_name,
          table.table_schema,
        );

        const elementTypes = await this.executeQuery<ColumnElementType>(stquery);
        // add element type to "elementType" property of field
        elementTypes.forEach((et) => {
          const fld = fields[et.column_name] as Field;
          if (fld.type === 'ARRAY') {
            fld.elementType = et.element_type;
            if (
              et.element_type === 'USER-DEFINED' &&
              et.enum_values &&
              !fld.special.length
            ) {
              fld.elementType = 'ENUM';
              // fromArray is a method defined on Postgres QueryGenerator only
              fld.special = (this.queryInterface as any).queryGenerator.fromArray(
                et.enum_values,
              );
            }
          } else if (fld.type === 'USER-DEFINED') {
            fld.type = !fld.special.length ? et.udt_name : 'ENUM';
          }
        });

        // TODO - in postgres, query geography_columns and geometry_columns for detail type and srid
        if (
          elementTypes.some((et) => et.udt_name === 'geography') &&
          this.dialect.showGeographyTypeQuery
        ) {
          const gquery = this.dialect.showGeographyTypeQuery(
            table.table_name,
            table.table_schema,
          );
          const gtypes = await this.executeQuery<ColumnElementType>(gquery);
          gtypes.forEach((gt) => {
            const fld = fields[gt.column_name] as Field;
            if (fld.type === 'geography') {
              fld.elementType = `'${gt.udt_name}', ${gt.data_type}`;
            }
          });
        }

        if (
          elementTypes.some((et) => et.udt_name === 'geometry') &&
          this.dialect.showGeometryTypeQuery
        ) {
          const gquery = this.dialect.showGeometryTypeQuery(
            table.table_name,
            table.table_schema,
          );
          const gtypes = await this.executeQuery<ColumnElementType>(gquery);
          gtypes.forEach((gt) => {
            const fld = fields[gt.column_name] as Field;
            if (fld.type === 'geometry') {
              fld.elementType = `'${gt.udt_name}', ${gt.data_type}`;
            }
          });
        }
      }

      // for mssql numeric types, get the precision. QueryInterface.describeTable does not return it
      if (
        this.dialect.showPrecisionQuery &&
        (_.some(fields, { type: 'DECIMAL' }) || _.some(fields, { type: 'NUMERIC' }))
      ) {
        const prequery = this.dialect.showPrecisionQuery(
          table.table_name,
          table.table_schema,
        );
        const columnPrec = await this.executeQuery<ColumnPrecision>(prequery);
        columnPrec.forEach((cp) => {
          const fld = fields[cp.column_name] as Field;
          if (
            cp.numeric_precision &&
            (fld.type === 'DECIMAL' || fld.type === 'NUMERIC')
          ) {
            fld.type = `${fld.type}(${cp.numeric_precision},${cp.numeric_scale})`;
          }
        });
      }

      this.tableData.indexes[makeTableQName(table)] =
        (await this.queryInterface.showIndex({
          tableName: table.table_name,
          schema: table.table_schema,
        })) as IndexSpec[];

      // if there is no primaryKey, and `id` field exists, then make id the primaryKey (#480)
      if (!_.some(fields, { primaryKey: true })) {
        const idname = _.keys(fields).find((f) => f.toLowerCase() === 'id');
        const idfield = idname && fields[idname];
        if (idfield) {
          idfield.primaryKey = true;
        }
      }
      return fields;
    } catch (err) {
      console.error(err);
    }
  }

  private async generator(tableData: any, row: any) {
    const generator = new AutoGenerator(tableData, row, this.options);
    return generator.generateText();
  }

  private executeQuery<T>(query: string): Promise<T[]> {
    return this.sequelize.query(query, {
      type: QueryTypes.SELECT,
      raw: true,
      // logging: false,
    }) as any as Promise<T[]>;
  }
}

// option tables are a list of strings; each string is either
// table name (e.g. "Customer") or schema dot table name (e.g. "dbo.Customer")
function mapOptionTables(arr: string[], defaultSchema: string | undefined): Table[] {
  return _.map(arr, (t: string) => {
    const sp = t.split('.');
    return {
      table_name: sp[sp.length - 1],
      table_schema: sp.length > 1 ? sp[sp.length - 2] : defaultSchema,
    };
  });
}

function isTableEqual(a: Table, b: Table) {
  return (
    a.table_name === b.table_name &&
    (!b.table_schema || a.table_schema === b.table_schema)
  );
}

function makeTableQName(table: Table) {
  return [table.table_schema, table.table_name].filter(Boolean).join('.');
}