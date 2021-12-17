import _ from 'lodash';
import moment from 'moment';

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
  foreignKeys: any;
  options: AutoOptions;

  constructor(tableData: TableData, rows: any, options: AutoOptions) {
    // this.tables = tableData.tables;
    // this.indexes = tableData.indexes;
    this.tableData = tableData;
    this.options = options;
    this.rows = rows;
    this.space = makeIndent(true, 2);
    this.foreignKeys = tableData.foreignKeys;
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
            typeof this.options.tableOptions[tableName].columnDef![field] !== 'undefined'
          ) {
            if (
              typeof this.options.tableOptions[tableName].columnDef![field] !==
              'undefined'
            ) {
              const columnOptions =
                this.options.tableOptions[tableName].columnDef![field];
              if (columnOptions.skip) {
                return;
              }
              if (typeof columnOptions.value !== 'undefined') {
                value = columnOptions.value;
              }
            }
          }

          str += `${space[6]}${field}: `;
          if (this.isNumber(field_type) || this.isBoolean(field_type) || value === null) {
            str += `${value},\n`;
          } else if (this.isDate(field_type)) {
            value = moment(value).format('YYYY-MM-DD HH:mm:ss.SSS') + 'Z';
            str += `'${value}',\n`;
          } else if (this.isJSON(field_type)) {
            str += "'" + JSON.stringify(value) + "',\n";
          } else if (this.isArray(field_type)) {
            value = value.map(function (s: string) {
              return s.trim();
            });
            str += "['" + value.join("', ") + "'],\n";
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
    str += `${space[1]}down: async (queryInterface) => {\n`;
    str += `${space[2]}const transaction = await queryInterface.sequelize.transaction();\n`;
    str += `${space[2]}try {\n`;
    str += `${space[3]}console.log('Dropping Seeders ${tableName}...');\n`;
    // let sql = `ALTER TABLE ${tableName} DISABLE TRIGGER ALL`;
    // str += `${space[3]}await queryInterface.sequelize.query("${sql}", { transaction });\n`;
    str += this.addConstraint();
    // sql = `ALTER TABLE ${tableName} ENABLE TRIGGER ALL`;
    // str += `${space[3]}await queryInterface.sequelize.query("${sql}", { transaction });\n`;

    str += `${space[3]}await transaction.commit();\n`;
    str += `${space[2]}} catch (err) {\n`;
    str += `${space[3]}await transaction.rollback();\n`;
    str += `${space[3]}throw err;\n`;
    str += `${space[2]}}\n`;
    str += `${space[1]}},\n`;
    str += `};\n`;
    this.tableData.text = str;
    await this.writeFile();
  }

  private addConstraint() {
    const { tableName: tableNameOrig } = this.tableData;
    const space = this.space;
    // const tablenamewithSchema = `${tableSchema}.${tableNameOrig}`;
    // add all Up fields
    let str = '';
    this.foreignKeys.forEach((field: any) => {
      str += this.removeForignKeyRelations(field);
    });
    const sql = `TRUNCATE TABLE "${tableNameOrig}" RESTART IDENTITY`;
    str += `${space[3]}await queryInterface.sequelize.query('${sql}', { transaction });\n`;
    this.foreignKeys.forEach((field: any) => {
      str += this.addForignKeyRelations(field);
    });

    return str;
  }

  private addForignKeyRelations(foreignKey: any): string {
    // Find foreign key
    let str = '';
    const space = this.space;
    // str += `${space[3]}console.log('${foreignKey.constraint_name}');\n`;
    str += `${space[3]}await queryInterface.addConstraint('${foreignKey.source_table}', {\n`;
    str += `${space[4]}type: 'foreign key',\n`;
    str += `${space[4]}name: '${foreignKey.constraint_name}',\n`;
    str += `${space[4]}fields: ['${foreignKey.source_column}'],\n`;
    str += `${space[4]}references: {\n`;
    str += `${space[5]}table: '${foreignKey.target_table}',\n`;
    str += `${space[5]}field: '${foreignKey.target_column}',\n`;
    str += `${space[4]}},\n`;
    str += `${space[4]}onDelete: '${foreignKey.on_delete}',\n`;
    str += `${space[4]}onUpdate: '${foreignKey.on_update}',\n`;
    str += `${space[4]}transaction,\n`;
    str += `${space[3]}});\n`;
    return str;
  }

  private removeForignKeyRelations(foreignKey: any): string {
    // Find foreign key

    let str = '';
    const space = this.space;
    // str += `${space[3]}console.log('${foreignKey.constraint_name}');\n`;
    str += `${space[3]}await queryInterface.removeConstraint('${foreignKey.source_table}', '${foreignKey.constraint_name}', { transaction });\n`;
    return str;
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
