import _ from 'lodash';

// import { ColumnDescription } from 'sequelize/types';
import { AutoWriter } from './auto-writer';
// import { DialectOptions, FKSpec } from './../dialects/dialect-options';
import {
  AutoOptions,
  // CaseFileOption,
  // CaseOption,
  Field,
  // IndexSpec,
  makeIndent,
  TableData,
  // LangOption,
  // makeTableName,
  // pluralize,
  // qNameJoin,
  // qNameSplit,
  // recase,
  // Relation,
  // replace,
  // singularize,
  // TSField,
} from './types';
/** Generates text from each table in TableData */
export class AutoGenerator {
  // tables: { [tableName: string]: { [fieldName: string]: ColumnDescription } };
  // indexes: { [tableName: string]: IndexSpec[] };
  tableData: any;
  space: string[];
  rows: any;
  options: AutoOptions;

  constructor(tableData: TableData, rows: any, options: AutoOptions) {
    // this.tables = tableData.tables;
    // this.indexes = tableData.indexes;
    this.tableData = tableData;
    this.options = options;
    this.rows = rows;
    this.space = makeIndent(true, 2);
  }

  async generateText() {
    const space = this.space;
    const { tableName } = this.tableData;
    let str = `module.exports = {\n`;
    str += `${space[1]}up: async (queryInterface) => {\n`;

    str += `${space[2]}const transaction = await queryInterface.sequelize.transaction();\n`;
    str += `${space[2]}try {\n`;

    str += `${space[3]}await queryInterface.bulkInsert(\n`;
    str += `${space[4]}'${tableName}',\n`;
    str += `${space[4]}[\n`;
    let tableOptions: any = true;
    if (this.options.tableOptions && this.options.tableOptions[tableName]) {
      tableOptions = true;
    }
    this.rows.forEach(async (row: any) => {
      // if (typeof row.user_id !== 'undefined' && row.user_id === null) {
      //   return;
      // }
      const fields = _.keys(row);
      str += `${space[5]}{\n`;
      fields.forEach((field) => {
        if (this.tableData.fields && this.tableData.fields[field]) {
          const fieldObj = this.tableData.fields[field] as Field;
          const field_type = fieldObj.type.toLowerCase();
          let value = row[field];

          if (
            tableOptions &&
            this.options.tableOptions &&
            this.options.tableOptions[tableName] &&
            this.options.tableOptions[tableName].columnDef &&
            this.options.tableOptions[tableName].columnDef![field]
          ) {
            if (this.options.tableOptions[tableName].columnDef!['field']) {
              const columnOptions =
                this.options.tableOptions[tableName].columnDef!['field'];
              if (columnOptions.skip) {
                return;
              }
              if (columnOptions.value) {
                value = columnOptions.value;
              }
            }
          }

          str += `${space[6]}${field}: `;
          if (this.isNumber(field_type) || this.isBoolean(field_type) || value === null) {
            str += `${value},\n`;
          } else if (this.isJSON(field_type)) {
            str += "'" + JSON.stringify(value) + "',\n";
          } else {
            str += `'${value}',\n`;
          }
        }
      });
      str += `${space[5]}},\n`;
    });
    // add the table options
    str += space[4] + '], {\n';
    str += space[5] + 'transaction,\n';
    str += space[4] + '},\n';
    str += space[3] + ');\n';
    //End of Try method
    str += `${space[3]}await transaction.commit();\n`;
    str += `${space[2]}} catch (err) {\n`;
    str += `${space[3]}await transaction.rollback();\n`;
    str += `${space[3]}throw err;\n`;
    str += `${space[2]}}\n`;
    str += `${space[1]}},\n`;
    // str += `${space[1]}down: async (queryInterface) => {\n`;
    // // str += `${space[2]}const transaction = await queryInterface.sequelize.transaction();\n`;
    // str += `${space[2]}try {\n`;

    // str += `${space[3]}console.log('Dropping Seeders ${tableName}...');\n`;
    // // str += `${space[3]}await transaction.commit();\n`;
    // str += `${space[2]}} catch (err) {\n`;
    // // str += `${space[3]}await transaction.rollback();\n`;
    // str += `${space[3]}throw err;\n`;
    // str += `${space[2]}}\n`;
    // str += `${space[1]}},\n`;
    str += `};\n`;
    this.tableData.text = str;
    await this.writeFile();
  }

  async writeFile() {
    const writer = new AutoWriter(this.tableData, this.options);
    await writer.write();
  }
  private isNumber(fieldType: string): boolean {
    return /^(smallint|mediumint|tinyint|int|bigint|float|money|smallmoney|double|decimal|numeric|real|oid)/.test(
      fieldType,
    );
  }

  private isBoolean(fieldType: string): boolean {
    return /^(boolean|bit)/.test(fieldType);
  }

  private isDate(fieldType: string): boolean {
    return /^(datetime|timestamp)/.test(fieldType);
  }

  private isString(fieldType: string): boolean {
    return /^(char|nchar|string|varying|varchar|nvarchar|text|longtext|mediumtext|tinytext|ntext|uuid|uniqueidentifier|date|time|inet|cidr|macaddr)/.test(
      fieldType,
    );
  }

  private isArray(fieldType: string): boolean {
    return /(^array)|(range$)/.test(fieldType);
  }

  private isEnum(fieldType: string): boolean {
    return /^(enum)/.test(fieldType);
  }

  private isJSON(fieldType: string): boolean {
    return /^(json|jsonb)/.test(fieldType);
  }
}
