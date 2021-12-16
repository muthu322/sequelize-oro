import _ from 'lodash';
import { ColumnDescription } from 'sequelize/types';

import { DialectOptions, FKSpec } from './../dialects/dialect-options';
import {
  AutoOptions,
  CaseFileOption,
  CaseOption,
  Field,
  IndexSpec,
  LangOption,
  makeIndent,
  pluralize,
  qNameJoin,
  qNameSplit,
  recase,
  Relation,
  replace,
  singularize,
  TableData,
  TSField,
} from './types';

/** Generates text from each table in TableData */
export class AutoGenerator {
  dialect: DialectOptions;
  tables: { [tableName: string]: { [fieldName: string]: ColumnDescription } };
  foreignKeys: { [tableName: string]: { [fieldName: string]: FKSpec } };
  junction: any;
  triggers: any;
  hasTriggerTables: { [tableName: string]: boolean };
  indexes: { [tableName: string]: IndexSpec[] };
  relations: Relation[];
  space: string[];
  type: any;
  options: {
    indentation?: number;
    spaces?: boolean;
    lang?: LangOption;
    caseModel?: CaseOption;
    caseProp?: CaseOption;
    caseFile?: CaseFileOption;
    skipFields?: string[];
    additional?: any;
    schema?: string;
    singularize: boolean;
    useDefine: boolean;
    noIndexes?: boolean;
    functionQuery?: boolean;
  };

  constructor(
    tableData: TableData,
    dialect: DialectOptions,
    options: AutoOptions,
    type: any,
  ) {
    this.tables = tableData.tables;
    this.foreignKeys = tableData.foreignKeys;
    this.junction = tableData.junction;
    this.triggers = tableData.triggers;
    this.hasTriggerTables = tableData.hasTriggerTables;
    this.indexes = tableData.indexes;
    this.relations = tableData.relations;
    this.dialect = dialect;
    this.options = options;
    this.options.lang = this.options.lang || 'es5';
    this.space = makeIndent(this.options.spaces, this.options.indentation);
    this.type = type;
  }

  makeHeaderTemplate() {
    let header = '';
    // const sp = this.space[1];
    header += 'module.exports = {\n';
    return header;
  }

  generateMigration() {
    const tableNames = _.keys(this.tables);
    const header = `module.exports = {\n`;
    const text: { [name: string]: string } = {};
    tableNames.forEach((table) => {
      let str = header;
      const { tableName: tableNameOrig } = qNameSplit(table);
      if (tableNameOrig) {
        str += this.addMigrationTable(table);
        const re = new RegExp('#TABLE#', 'g');
        str = str.replace(re, tableNameOrig);

        text[table] = str;
      }
    });

    return text;
  }
  // Create a string for the model of the table
  private addMigrationTable(table: string) {
    const { schemaName, tableName: tableNameOrig } = qNameSplit(table);
    const space = this.space;
    let timestamps =
      (this.options.additional && this.options.additional.timestamps === true) || false;
    let paranoid =
      (this.options.additional && this.options.additional.paranoid === true) || false;

    // add all Up fields
    let str = `${space[1]}up: async (queryInterface, Sequelize) => {\n`;

    str += `${space[2]}const transaction = await queryInterface.sequelize.transaction();\n`;
    str += `${space[2]}try {\n`;

    str += `${space[3]}await queryInterface.createTable(\n`;
    str += `${space[4]}'${tableNameOrig}',\n`;
    str += `${space[4]}{\n`;
    const fields = _.keys(this.tables[table]);
    fields.forEach((field) => {
      timestamps ||= this.isTimestampField(field);
      paranoid ||= this.isParanoidField(field);

      str += this.addMigrationField(table, field);
    });
    // add the table options
    str += space[4] + '}, {\n';

    if (schemaName && this.dialect.hasSchema) {
      str += space[5] + "schema: '" + schemaName + "',\n";
    }

    if (this.hasTriggerTables[table]) {
      str += space[5] + 'hasTrigger: true,\n';
    }

    str += space[5] + 'timestamps: ' + timestamps + ',\n';
    if (paranoid) {
      str += space[5] + 'paranoid: true,\n';
    }

    // conditionally add additional options
    const hasadditional =
      _.isObject(this.options.additional) && _.keys(this.options.additional).length > 0;
    if (hasadditional) {
      _.each(this.options.additional, (value, key) => {
        if (key === 'name') {
          // name: true - preserve table name always
          str += space[5] + 'name: {\n';
          str += space[6] + "singular: '" + table + "',\n";
          str += space[6] + "plural: '" + table + "'\n";
          str += space[5] + '},\n';
        } else if (key === 'timestamps' || key === 'paranoid') {
          // handled above
        } else {
          value = _.isBoolean(value) ? value : "'" + value + "'";
          str += space[5] + key + ': ' + value + ',\n';
        }
      });
    }

    // add indexes

    str += `${space[4]}}, { transaction },\n`;
    str += `${space[3]});\n`;
    str += this.addMigrationIndex(table, tableNameOrig || 'table');
    str += this.addMigrationFunctions(table);
    str += `${space[3]}await transaction.commit();\n`;
    str += `${space[2]}} catch (err) {\n`;
    str += `${space[3]}await transaction.rollback();\n`;
    str += `${space[3]}throw err;\n`;
    str += `${space[2]}}\n`;
    str += `${space[1]}},\n`;
    str += `${space[1]}down: async (queryInterface) => {\n`;
    str += `${space[2]}const transaction = await queryInterface.sequelize.transaction();\n`;
    str += `${space[2]}try {\n`;

    str += `${space[3]}console.log('Dropping Table ${tableNameOrig}...');\n`;
    // str += this.removeMigrationIndex(table, tableNameOrig || 'table');
    // fields.forEach((field, index) => {
    //   str += this.removeForignKeyRelations(table, field, tableNameOrig||'table');
    // });
    str += this.removeMigrationFunctions(table);
    str += `${space[3]}await queryInterface.dropTable('${tableNameOrig}', { transaction });\n`;
    str += `${space[3]}await transaction.commit();\n`;
    str += `${space[2]}} catch (err) {\n`;
    str += `${space[3]}await transaction.rollback();\n`;
    str += `${space[3]}throw err;\n`;
    str += `${space[2]}}\n`;
    str += `${space[1]}},\n`;
    str += `};\n`;

    return str;
  }

  // Create a string containing field attributes (type, defaultValue, etc.)
  private addMigrationField(table: string, field: string): string {
    // ignore Sequelize standard fields
    const additional = this.options.additional;
    if (
      additional &&
      additional.timestamps !== false &&
      (this.isTimestampField(field) || this.isParanoidField(field))
    ) {
      return '';
    }

    if (this.isIgnoredField(field)) {
      return '';
    }

    // Find foreign key
    const foreignKey =
      this.foreignKeys[table] && this.foreignKeys[table][field]
        ? this.foreignKeys[table][field]
        : null;
    const fieldObj = this.tables[table][field] as Field;

    if (_.isObject(foreignKey)) {
      fieldObj.foreignKey = foreignKey;
    }

    const fieldName = recase(this.options.caseProp, field);
    let str = this.quoteName(fieldName) + ': {\n';

    const quoteWrapper = "'";

    const unique =
      fieldObj.unique || (fieldObj.foreignKey && fieldObj.foreignKey.isUnique);

    const isSerialKey =
      (fieldObj.foreignKey && fieldObj.foreignKey.isSerialKey) ||
      (this.dialect.isSerialKey && this.dialect.isSerialKey(fieldObj));

    let wroteAutoIncrement = false;
    const space = this.space;

    // column's attributes
    const fieldAttrs = _.keys(fieldObj);
    fieldAttrs.forEach((attr) => {
      // We don't need the special attribute from postgresql; "unique" is handled separately
      if (attr === 'special' || attr === 'elementType' || attr === 'unique') {
        return true;
      }

      if (isSerialKey && !wroteAutoIncrement) {
        str += space[6] + 'autoIncrement: true,\n';
        // Resort to Postgres' GENERATED BY DEFAULT AS IDENTITY instead of SERIAL
        if (
          this.dialect.name === 'postgres' &&
          fieldObj.foreignKey &&
          fieldObj.foreignKey.isPrimaryKey === true &&
          (fieldObj.foreignKey.generation === 'ALWAYS' ||
            fieldObj.foreignKey.generation === 'BY DEFAULT')
        ) {
          str += space[6] + 'autoIncrementIdentity: true,\n';
        }
        wroteAutoIncrement = true;
      }

      if (attr === 'foreignKey') {
        return true;
      } else if (attr === 'references') {
        // covered by foreignKey
        return true;
      } else if (attr === 'primaryKey') {
        if (
          fieldObj[attr] === true &&
          (!_.has(fieldObj, 'foreignKey') || !!fieldObj.foreignKey.isPrimaryKey)
        ) {
          str += space[6] + 'primaryKey: true';
        } else {
          return true;
        }
      } else if (attr === 'autoIncrement') {
        if (fieldObj[attr] === true && !wroteAutoIncrement) {
          str += space[6] + 'autoIncrement: true,\n';
          // Resort to Postgres' GENERATED BY DEFAULT AS IDENTITY instead of SERIAL
          if (
            this.dialect.name === 'postgres' &&
            fieldObj.foreignKey &&
            fieldObj.foreignKey.isPrimaryKey === true &&
            (fieldObj.foreignKey.generation === 'ALWAYS' ||
              fieldObj.foreignKey.generation === 'BY DEFAULT')
          ) {
            str += space[6] + 'autoIncrementIdentity: true,\n';
          }
          wroteAutoIncrement = true;
        }
        return true;
      } else if (attr === 'allowNull') {
        str += space[6] + attr + ': ' + fieldObj[attr];
      } else if (attr === 'defaultValue') {
        let defaultVal = fieldObj.defaultValue;
        if (
          this.dialect.name === 'mssql' &&
          defaultVal &&
          defaultVal.toLowerCase() === '(newid())'
        ) {
          defaultVal = null as any; // disable adding "default value" attribute for UUID fields if generating for MS SQL
        }
        if (
          this.dialect.name === 'mssql' &&
          (['(NULL)', 'NULL'].includes(defaultVal) || typeof defaultVal === 'undefined')
        ) {
          defaultVal = null as any; // Override default NULL in MS SQL to javascript null
        }

        if (defaultVal === null || defaultVal === undefined) {
          return true;
        }
        if (isSerialKey) {
          return true; // value generated in the database
        }

        let val_text = defaultVal;
        if (_.isString(defaultVal)) {
          const field_type = fieldObj.type.toLowerCase();
          defaultVal = this.escapeSpecial(defaultVal);

          while (defaultVal.startsWith('(') && defaultVal.endsWith(')')) {
            // remove extra parens around mssql defaults
            defaultVal = defaultVal.replace(/^[(]/, '').replace(/[)]$/, '');
          }

          if (
            field_type === 'bit(1)' ||
            field_type === 'bit' ||
            field_type === 'boolean'
          ) {
            // convert string to boolean
            val_text = /1|true/i.test(defaultVal) ? 'true' : 'false';
          } else if (this.isArray(field_type)) {
            // remove outer {}
            val_text = defaultVal.replace(/^{/, '').replace(/}$/, '');
            if (val_text && this.isString(fieldObj.elementType)) {
              // quote the array elements
              val_text = val_text
                .split(',')
                .map((s) => `"${s}"`)
                .join(',');
            }
            val_text = `[${val_text}]`;
          } else if (field_type.match(/^(json)/)) {
            // don't quote json
            val_text = defaultVal;
          } else if (
            field_type === 'uuid' &&
            (defaultVal === 'gen_random_uuid()' || defaultVal === 'uuid_generate_v4()')
          ) {
            val_text = 'Sequelize.DataTypes.UUIDV4';
          } else if (defaultVal.match(/\w+\(\)$/)) {
            // replace db function with sequelize function
            val_text =
              "Sequelize.Sequelize.fn('" + defaultVal.replace(/\(\)$/g, '') + "')";
          } else if (this.isNumber(field_type)) {
            if (defaultVal.match(/\(\)/g)) {
              // assume it's a server function if it contains parens
              val_text = "Sequelize.Sequelize.literal('" + defaultVal + "')";
            } else {
              // don't quote numbers
              val_text = defaultVal;
            }
          } else if (defaultVal.match(/\(\)/g)) {
            // embedded function, pass as literal
            val_text = "Sequelize.Sequelize.literal('" + defaultVal + "')";
          } else if (
            field_type.indexOf('date') === 0 ||
            field_type.indexOf('timestamp') === 0
          ) {
            if (
              _.includes(
                [
                  'current_timestamp',
                  'current_date',
                  'current_time',
                  'localtime',
                  'localtimestamp',
                ],
                defaultVal.toLowerCase(),
              )
            ) {
              val_text = "Sequelize.Sequelize.literal('" + defaultVal + "')";
            } else {
              val_text = quoteWrapper + defaultVal + quoteWrapper;
            }
          } else {
            val_text = quoteWrapper + defaultVal + quoteWrapper;
          }
        }

        // val_text = _.isString(val_text) && !val_text.match(/^sequelize\.[^(]+\(.*\)$/)
        // ? self.sequelize.escape(_.trim(val_text, '"'), null, self.options.dialect)
        // : val_text;
        // don't prepend N for MSSQL when building models...
        // defaultVal = _.trimStart(defaultVal, 'N');

        str += space[6] + attr + ': ' + val_text;
      } else if (attr === 'comment' && !fieldObj[attr]) {
        return true;
      } else {
        let val = attr !== 'type' ? null : this.getSqType(fieldObj, attr);
        if (val == null) {
          val = (fieldObj as any)[attr];
          val = _.isString(val)
            ? quoteWrapper + this.escapeSpecial(val) + quoteWrapper
            : val;
        }
        str += space[6] + attr + ': ' + val;
      }

      str += ',\n';
    });

    if (unique) {
      const uniq = _.isString(unique)
        ? quoteWrapper + unique.replace(/"/g, '\\"') + quoteWrapper
        : unique;
      str += space[6] + 'unique: ' + uniq + ',\n';
    }

    if (field !== fieldName) {
      str += space[6] + "field: '" + field + "',\n";
    }

    // removes the last `,` within the attribute options
    //str = str.trim().replace(/,+$/, '') + "\n";
    str = space[5] + str + space[5] + '},\n';
    return str;
  }

  private addMigrationIndex(table: string, tableNameOrig: string): string {
    const indexes = this.indexes[table];
    const space = this.space;
    let str = '';
    if (indexes && indexes.length) {
      indexes.forEach((idx) => {
        if (idx.primary && idx.unique) {
          return;
        }

        str += `${space[3]}await queryInterface.addIndex('${tableNameOrig}', {\n`;
        if (idx.name) {
          str += space[4] + `name: '${idx.name}',\n`;
        }

        if (idx.unique) {
          str += `${space[4]}unique: true,\n`;
        }

        if (idx.type) {
          if (['UNIQUE', 'FULLTEXT', 'SPATIAL'].includes(idx.type)) {
            str += `${space[4]}type: '${idx.type}',\n`;
          } else {
            str += space[4] + `using: "${idx.type}",\n`;
          }
        }

        str += space[4] + `fields: [\n`;
        idx.fields.forEach((ff) => {
          str += space[5] + `{ name: '${ff.attribute}'`;
          if (ff.collate) {
            str += `, collate: '${ff.collate}'`;
          }
          if (ff.length) {
            str += `, length: ${ff.length}`;
          }
          if (ff.order && ff.order !== 'ASC') {
            str += `, order: '${ff.order}'`;
          }
          str += ' },\n';
        });

        str += space[4] + '],\n';
        str += `${space[4]}transaction,\n`;
        str += space[3] + '});\n';
      });
    }
    return str;
  }

  private addMigrationFunctions(table: string): string {
    let str = '';
    const space = this.space;
    if (this.triggers && this.triggers[table]) {
      Object.values(this.triggers[table]).forEach((rel: any) => {
        // console.log(rel);
        if (this.options.functionQuery) {
          str += `${space[3]}await queryInterface.sequelize.query('${rel.funcion_def}', { transaction });\n`;
        } else {
          str += `${space[3]}await queryInterface.createFunction(\n`;
          // function name
          str += `${space[4]}'${rel.proname}',\n`;
          str += `${space[4]}[\n`;
          // Function params
          if (rel.argument_data_types && rel.argument_data_types !== '') {
            str += `${space[5]}${rel.argument_data_types}\n`;
          }
          str += `${space[4]}],\n`;
          // Return data types
          str += `${space[4]}'${rel.result_data_type}',\n`;
          // language
          str += `${space[4]}'${rel.lanname}',\n`;
          // body of function
          let function_body = rel.prosrc;
          function_body = function_body
            .replace(new RegExp('BEGIN', 'g'), '')
            .replace(new RegExp('END;', 'g'), '');

          str += space[4] + '`' + function_body.trim() + '`,\n';
          // function options
          str += `${space[4]}[\n`;
          if (rel.provolatile) {
            if (rel.provolatile === 'i') {
              str += `${space[5]}'IMMUTABLE',\n`;
            } else if (rel.provolatile === 'v') {
              str += `${space[5]}'VOLATILE',\n`;
            } else if (rel.provolatile === 's') {
              str += `${space[5]}'STABLE',\n`;
            }
          }
          if (rel.proleakproof) {
            str += `${space[5]}'LEAKPROOF',\n`;
          } else {
            str += `${space[5]}'NOT LEAKPROOF',\n`;
          }
          if (rel.proisstrict) {
            str += `${space[5]}'STRICT',\n`;
          }
          if (rel.prosecdef) {
            str += `${space[5]}'SECURITY DEFINER',\n`;
          }
          if (rel.procost) {
            str += `${space[5]}'COST ${rel.procost}',\n`;
          }
          str += `${space[4]}],\n`;
          // query options
          str += `${space[4]}{ transaction, force: true },\n`;
          str += `${space[3]});\n`;
        }
        // create trigger query from triggerschema
        let sql = 'CREATE TRIGGER ';
        // trigger name
        sql += rel.trigger_name + ' ';
        // action timinng
        if (rel.action_timing && rel.action_timing !== '') sql += rel.action_timing + ' ';
        // action name
        if (rel.event_manipulation && rel.event_manipulation !== '')
          sql += rel.event_manipulation + ' ';
        // action condition
        if (rel.action_condition && rel.action_condition !== '')
          sql += rel.action_condition + ' ';
        // action Table
        sql += `ON  ${rel.event_object_schema}.${rel.event_object_table} `;
        // action how performed
        if (rel.action_orientation) {
          if (rel.action_orientation === 'ROW') {
            sql += 'FOR EACH ROW ';
          }
        }
        // execute function
        if (rel.action_statement && rel.action_statement !== '') {
          sql += rel.action_statement;
        }
        str += `${space[3]}await queryInterface.sequelize.query(\n`;
        str += `${space[4]}'${sql}',\n`;
        str += `${space[4]}{ transaction },\n`;
        str += `${space[3]});\n`;
      });
    }
    return str;
  }

  private removeMigrationFunctions(table: string): string {
    let str = '';
    const space = this.space;
    if (this.triggers && this.triggers[table]) {
      Object.values(this.triggers[table]).forEach((rel: any) => {
        // create trigger query from triggerschema
        let sql = 'DROP TRIGGER IF EXISTS ';
        // trigger name
        sql += rel.trigger_name + ' ';
        // action Table
        sql += `ON  ${rel.event_object_schema}.${rel.event_object_table} `;

        str += `${space[3]}await queryInterface.sequelize.query(\n`;
        str += `${space[4]}'${sql}',\n`;
        str += `${space[4]}{ transaction },\n`;
        str += `${space[3]});\n`;

        str += `${space[3]}await queryInterface.dropFunction(`;
        // function name
        str += `'${rel.proname}', `;
        str += `[`;
        // Function params
        if (rel.argument_data_types && rel.argument_data_types !== '') {
          str += `\n${space[5]}${rel.argument_data_types}\n`;
        }
        str += `], `;
        str += `{ transaction });\n`;
      });
    }
    return str;
  }

  private removeMigrationIndex(table: string, tableNameOrig: string): string {
    const indexes = this.indexes[table];
    const space = this.space;
    let str = '';
    if (indexes && indexes.length) {
      indexes.forEach((idx) => {
        if (idx.name) {
          str += `${space[3]}await queryInterface.removeIndex('${tableNameOrig}', '${idx.name}', { transaction });\n`;
        }
      });
    }
    return str;
  }

  generateConstraint() {
    const tableNames = _.keys(this.tables);
    const header = `module.exports = {\n`;
    const text: { [name: string]: string } = {};
    tableNames.forEach((table) => {
      let str = header;
      const { tableName: tableNameOrig } = qNameSplit(table);
      if (tableNameOrig) {
        str += this.addConstraint(table);
        const re = new RegExp('#TABLE#', 'g');
        str = str.replace(re, tableNameOrig);

        text[table] = str;
      }
    });

    return text;
  }
  private addConstraint(table: string) {
    const { tableName: tableNameOrig } = qNameSplit(table);
    const space = this.space;

    // add all Up fields
    let str = `${space[1]}up: async (queryInterface) => {\n`;
    str += `${space[2]}const transaction = await queryInterface.sequelize.transaction();\n`;
    str += `${space[2]}try {\n`;
    const fields = _.keys(this.tables[table]);
    fields.forEach((field) => {
      str += this.addForignKeyRelations(table, field, tableNameOrig || 'table');
    });
    str += `${space[3]}await transaction.commit();\n`;
    str += `${space[2]}} catch (err) {\n`;
    str += `${space[3]}await transaction.rollback();\n`;
    str += `${space[3]}throw err;\n`;
    str += `${space[2]}}\n`;
    str += `${space[1]}},\n`;
    str += `${space[1]}down: async (queryInterface) => {\n`;
    str += `${space[2]}const transaction = await queryInterface.sequelize.transaction();\n`;
    str += `${space[2]}try {\n`;

    str += `${space[3]}console.log('Dropping Constraints of Table ${tableNameOrig}...');\n`;
    fields.forEach((field) => {
      str += this.removeForignKeyRelations(table, field, tableNameOrig || 'table');
    });
    str += `${space[3]}await transaction.commit();\n`;
    str += `${space[2]}} catch (err) {\n`;
    str += `${space[3]}await transaction.rollback();\n`;
    str += `${space[3]}throw err;\n`;
    str += `${space[2]}}\n`;
    str += `${space[1]}},\n`;
    str += `};\n`;

    return str;
  }
  private removeForignKeyRelations(
    table: string,
    field: string,
    tableNameOrig: string,
  ): string {
    // ignore Sequelize standard fields
    const additional = this.options.additional;
    if (
      additional &&
      additional.timestamps !== false &&
      (this.isTimestampField(field) || this.isParanoidField(field))
    ) {
      return '';
    }

    if (this.isIgnoredField(field)) {
      return '';
    }

    // Find foreign key
    const foreignKey =
      this.foreignKeys[table] && this.foreignKeys[table][field]
        ? this.foreignKeys[table][field]
        : null;
    const fieldObj = this.tables[table][field] as Field;

    if (_.isObject(foreignKey)) {
      fieldObj.foreignKey = foreignKey;
    }

    let str = '';
    const space = this.space;
    const fieldAttrs = _.keys(fieldObj);
    fieldAttrs.forEach((attr) => {
      if (attr === 'foreignKey') {
        if (foreignKey && foreignKey.isForeignKey) {
          str += `${space[3]}await queryInterface.removeConstraint('${tableNameOrig}', '${fieldObj[attr].foreignSources.constraint_name}', { transaction });\n`;
        } else {
          return true;
        }
      }
    });
    return str;
  }

  private addForignKeyRelations(
    table: string,
    field: string,
    tableNameOrig: string,
  ): string {
    // ignore Sequelize standard fields
    const additional = this.options.additional;
    if (
      additional &&
      additional.timestamps !== false &&
      (this.isTimestampField(field) || this.isParanoidField(field))
    ) {
      return '';
    }

    if (this.isIgnoredField(field)) {
      return '';
    }

    // Find foreign key
    const foreignKey =
      this.foreignKeys[table] && this.foreignKeys[table][field]
        ? this.foreignKeys[table][field]
        : null;
    const fieldObj = this.tables[table][field] as Field;

    if (_.isObject(foreignKey)) {
      fieldObj.foreignKey = foreignKey;
    }

    let str = '';
    const space = this.space;
    const fieldAttrs = _.keys(fieldObj);
    fieldAttrs.forEach((attr) => {
      if (attr === 'foreignKey') {
        if (foreignKey && foreignKey.isForeignKey) {
          str += `${space[3]}await queryInterface.addConstraint('${tableNameOrig}', {\n`;
          str += `${space[4]}type: 'foreign key',\n`;
          str += `${space[4]}name: '${fieldObj[attr].foreignSources.constraint_name}',\n`;
          str += `${space[4]}fields: ['${field}'],\n`;
          str += `${space[4]}references: {\n`;
          str += `${space[5]}table: '${fieldObj[attr].foreignSources.target_table}',\n`;
          str += `${space[5]}field: '${fieldObj[attr].foreignSources.target_column}',\n`;
          str += `${space[4]}},\n`;
          str += `${space[4]}onDelete: '${fieldObj[attr].foreignSources.on_delete}',\n`;
          str += `${space[4]}onUpdate: '${fieldObj[attr].foreignSources.on_update}',\n`;
          str += `${space[4]}transaction,\n`;
          str += `${space[3]}});\n`;
        } else {
          return true;
        }
      }
    });
    return str;
  }

  private addIndexes(table: string) {
    const indexes = this.indexes[table];
    const space = this.space;
    let str = '';
    if (indexes && indexes.length) {
      str += space[2] + 'indexes: [\n';
      indexes.forEach((idx) => {
        str += space[3] + '{\n';
        if (idx.name) {
          str += space[4] + `name: '${idx.name}',\n`;
        }
        if (idx.unique) {
          str += space[4] + 'unique: true,\n';
        }
        if (idx.type) {
          if (['UNIQUE', 'FULLTEXT', 'SPATIAL'].includes(idx.type)) {
            str += space[4] + `type: "${idx.type}",\n`;
          } else {
            str += space[4] + `using: "${idx.type}",\n`;
          }
        }
        str += space[4] + `fields: [\n`;
        idx.fields.forEach((ff) => {
          str += space[5] + `{ name: '${ff.attribute}'`;
          if (ff.collate) {
            str += `, collate: '${ff.collate}'`;
          }
          if (ff.length) {
            str += `, length: ${ff.length}`;
          }
          if (ff.order && ff.order !== 'ASC') {
            str += `, order: '${ff.order}'`;
          }
          str += ' },\n';
        });
        str += space[4] + '],\n';
        str += space[3] + '},\n';
      });
      str += space[2] + '],\n';
    }
    return str;
  }

  /** Get the sequelize type from the Field */
  private getSqType(fieldObj: Field, attr: string): string {
    const attrValue = (fieldObj as any)[attr];
    if (!attrValue.toLowerCase) {
      // console.log("attrValue", attr, attrValue);
      return attrValue;
    }
    const type: string = attrValue.toLowerCase();
    const length = type.match(/\(\d+\)/);
    const precision = type.match(/\(\d+,\d+\)/);
    let val = null;
    let typematch = null;

    if (
      type === 'boolean' ||
      type === 'bit(1)' ||
      type === 'bit' ||
      type === 'tinyint(1)'
    ) {
      val = 'Sequelize.DataTypes.BOOLEAN';

      // postgres range types
    } else if (type === 'numrange') {
      val = 'Sequelize.DataTypes.RANGE(DataTypes.DECIMAL)';
    } else if (type === 'int4range') {
      val = 'Sequelize.DataTypes.RANGE(DataTypes.INTEGER)';
    } else if (type === 'int8range') {
      val = 'Sequelize.DataTypes.RANGE(DataTypes.BIGINT)';
    } else if (type === 'daterange') {
      val = 'Sequelize.DataTypes.RANGE(DataTypes.DATEONLY)';
    } else if (type === 'tsrange' || type === 'tstzrange') {
      val = 'Sequelize.DataTypes.RANGE(DataTypes.DATE)';
    } else if ((typematch = type.match(/^(bigint|smallint|mediumint|tinyint|int)/))) {
      // integer subtypes
      val =
        'Sequelize.DataTypes.' +
        (typematch[0] === 'int' ? 'INTEGER' : typematch[0].toUpperCase());
      if (/unsigned/i.test(type)) {
        val += '.UNSIGNED';
      }
      if (/zerofill/i.test(type)) {
        val += '.ZEROFILL';
      }
    } else if (type === 'nvarchar(max)' || type === 'varchar(max)') {
      val = 'Sequelize.DataTypes.TEXT';
    } else if (type.match(/n?varchar|string|varying/)) {
      val = 'Sequelize.DataTypes.STRING' + (!_.isNull(length) ? length : '');
    } else if (type.match(/^n?char/)) {
      val = 'Sequelize.DataTypes.CHAR' + (!_.isNull(length) ? length : '');
    } else if (type.match(/^real/)) {
      val = 'Sequelize.DataTypes.REAL';
    } else if (type.match(/text$/)) {
      val = 'Sequelize.DataTypes.TEXT' + (!_.isNull(length) ? length : '');
    } else if (type === 'date') {
      val = 'Sequelize.DataTypes.DATEONLY';
    } else if (type.match(/^(date|timestamp|year)/)) {
      val = 'Sequelize.DataTypes.DATE' + (!_.isNull(length) ? length : '');
    } else if (type.match(/^(time)/)) {
      val = 'Sequelize.DataTypes.TIME';
    } else if (type.match(/^(float|float4)/)) {
      val = 'Sequelize.DataTypes.FLOAT' + (!_.isNull(precision) ? precision : '');
    } else if (type.match(/^(decimal|numeric)/)) {
      val = 'Sequelize.DataTypes.DECIMAL' + (!_.isNull(precision) ? precision : '');
    } else if (type.match(/^money/)) {
      val = 'Sequelize.DataTypes.DECIMAL(19,4)';
    } else if (type.match(/^smallmoney/)) {
      val = 'Sequelize.DataTypes.DECIMAL(10,4)';
    } else if (type.match(/^(float8|double)/)) {
      val = 'Sequelize.DataTypes.DOUBLE' + (!_.isNull(precision) ? precision : '');
    } else if (type.match(/^uuid|uniqueidentifier/)) {
      val = 'Sequelize.DataTypes.UUID';
    } else if (type.match(/^jsonb/)) {
      val = 'Sequelize.DataTypes.JSONB';
    } else if (type.match(/^json/)) {
      val = 'Sequelize.DataTypes.JSON';
    } else if (type.match(/^geometry/)) {
      const gtype = fieldObj.elementType ? `(${fieldObj.elementType})` : '';
      val = `Sequelize.DataTypes.GEOMETRY${gtype}`;
    } else if (type.match(/^geography/)) {
      const gtype = fieldObj.elementType ? `(${fieldObj.elementType})` : '';
      val = `Sequelize.DataTypes.GEOGRAPHY${gtype}`;
    } else if (type.match(/^array/)) {
      const eltype = this.getSqType(fieldObj, 'elementType');
      val = `Sequelize.DataTypes.ARRAY(${eltype})`;
    } else if (type.match(/(binary|image|blob|bytea)/)) {
      val = 'Sequelize.DataTypes.BLOB';
    } else if (type.match(/^hstore/)) {
      val = 'Sequelize.DataTypes.HSTORE';
    } else if (type.match(/^inet/)) {
      val = 'Sequelize.DataTypes.INET';
    } else if (type.match(/^cidr/)) {
      val = 'Sequelize.DataTypes.CIDR';
    } else if (type.match(/^oid/)) {
      val = 'Sequelize.DataTypes.INTEGER';
    } else if (type.match(/^macaddr/)) {
      val = 'Sequelize.DataTypes.MACADDR';
    } else if (type.match(/^enum(\(.*\))?$/)) {
      const enumValues = this.getEnumValues(fieldObj);
      val = `Sequelize.DataTypes.ENUM(${enumValues.join(', ')})`;
    }

    return val as string;
  }

  private getTypeScriptPrimaryKeys(table: string): Array<string> {
    const fields = _.keys(this.tables[table]);
    return fields.filter((field): boolean => {
      const fieldObj = this.tables[table][field];
      return fieldObj['primaryKey'];
    });
  }

  private getTypeScriptCreationOptionalFields(table: string): Array<string> {
    const fields = _.keys(this.tables[table]);
    return fields.filter((field): boolean => {
      const fieldObj = this.tables[table][field];
      return (
        fieldObj.allowNull ||
        !!fieldObj.defaultValue ||
        fieldObj.defaultValue === '' ||
        fieldObj.autoIncrement ||
        this.isTimestampField(field)
      );
    });
  }

  /** Add schema to table so it will match the relation data.  Fixes mysql problem. */
  private addSchemaForRelations(table: string) {
    if (!table.includes('.') && !this.relations.some((rel) => rel.childTable === table)) {
      // if no tables match the given table, then assume we need to fix the schema
      const first = this.relations.find((rel) => !!rel.childTable);
      if (first) {
        const { schemaName } = qNameSplit(first.childTable);
        if (schemaName) {
          table = qNameJoin(schemaName, table);
        }
      }
    }
    return table;
  }

  addAssociationRelations(table: string) {
    const { space } = this;
    const needed: Record<string, Set<String>> = {};
    let str = '';
    table = this.addSchemaForRelations(table);
    str += `${space[1]}#TABLE#.associate = (models) => {\n`;
    this.relations.forEach((rel) => {
      let _a;
      let _b;
      let _c;
      let _d;
      let _e;

      // console.log("Relations");
      // console.log(rel);

      if (!rel.isM2M) {
        if (rel.childTable === table) {
          if (!/_x_/i.test(rel.target_table)) {
            // not relation for conjuction tables
            const tableName = recase(
              this.options.caseModel,
              rel.target_table,
              this.options.singularize,
            );
            if (tableName && tableName !== '') {
              str += `${space[2]}#TABLE#.belongsTo(models.${tableName}, {\n`;
              str += `${space[3]}foreignKey: '${rel.source_column}',\n`;
              str += `${space[3]}sourceKey: '${rel.target_column}',\n`;
              str += `${space[3]}as: '${replace(recase('c', rel.source_column), {
                Id: '',
                id: '',
              })}',\n`;
              str += `${space[2]}});\n`;
            } else {
              str += `// #TABLE#.belongsTo(models.${tableName}, {\n`;
              str += `// foreignKey: '${rel.source_column}',\n`;
              str += `// sourceKey: '${rel.target_column}',\n`;
              str += `// as: '${replace(recase('c', rel.source_column), {
                Id: '',
                id: '',
              })}',\n`;
              str += '// });\n';
            }
          }

          (_a = needed[(_d = rel.parentTable)]) !== null && _a !== void 0
            ? _a
            : (needed[_d] = new Set());
          needed[rel.parentTable].add(rel.parentModel);
          needed[rel.parentTable].add(`${rel.parentModel}Id`);
        } else if (rel.parentTable === table) {
          (_b = needed[(_e = rel.childTable)]) !== null && _b !== void 0
            ? _b
            : (needed[_e] = new Set());
          // const pchild = _.upperFirst(rel.childProp);
          if (rel.isOne) {
            str += `${space[2]}#TABLE#.hasOne(models.${rel.childModel}, {\n`;
            str += `${space[3]}foreignKey: '${rel.parentId}',\n`;
            str += `${space[2]}});\n`;
            needed[rel.childTable].add(rel.childModel);
            needed[rel.childTable].add(`${rel.childModel}Id`);
            needed[rel.childTable].add(`${rel.childModel}CreationAttributes`);
          } else {
            const hasModel = rel.childModel;
            // const sing = _.upperFirst(singularize(rel.childProp));
            // const lur = pluralize(rel.childProp);
            // const plur = _.upperFirst(lur);
            str += `${space[2]}#TABLE#.hasMany(models.${rel.childModel}, {\n`;
            str += `${space[3]}foreignKey: '${rel.parentId}',\n`;
            str += `${space[2]}});\n`;

            needed[rel.childTable].add(hasModel);
            needed[rel.childTable].add(`${hasModel}Id`);
          }
        }
      } else {
        // rel.isM2M
        if (rel.parentTable === table) {
          // many-to-many
          const isParent = rel.parentTable === table;
          // const thisModel = isParent ? rel.parentModel : rel.childModel;
          const otherModel = isParent ? rel.childModel : rel.parentModel;
          // const otherModelSingular = _.upperFirst(
          //   singularize(isParent ? rel.childProp : rel.parentProp),
          // );
          // const lotherModelPlural = pluralize(isParent ? rel.childProp : rel.parentProp);
          // const otherModelPlural = _.upperFirst(lotherModelPlural);
          const otherTable = isParent ? rel.childTable : rel.parentTable;
          str += `${space[2]}#TABLE#.belongsToMany(models.${rel.childModel}, {\n`;
          str += `${space[3]}foreignKey: '${rel.parentId}',\n`;
          str += `${space[2]}});\n`;

          (_c = needed[otherTable]) !== null && _c !== void 0
            ? _c
            : (needed[otherTable] = new Set());
          needed[otherTable].add(otherModel);
          needed[otherTable].add(`${otherModel}Id`);
        }
      }
    });
    // console.log("JUNCTION DATA "+table);
    // console.log(this.junction);
    if (this.junction[table]) {
      this.junction[table].forEach((rel: any) => {
        str += `${space[2]}#TABLE#.belongsToMany(models.${recase(
          this.options.caseModel,
          rel.source_model,
          this.options.singularize,
        )}, {\n`;
        str += `${space[3]}foreignKey: '${rel.foreignkey}',\n`;
        str += `${space[3]}through: '${rel.through}',\n`;
        str += `${space[3]}as: '${recase(
          'c',
          pluralize(replace(rel.source_model, { Id: '', id: '' })),
        )}',\n`;
        str += `${space[2]}});\n`;
      });
    }

    str += `${space[1]}};\n`;
    if (needed[table]) {
      delete needed[table]; // don't add import for self
    }
    return { needed, str };
  }

  private addTypeScriptAssociationMixins(table: string): Record<string, any> {
    const sp = this.space[1];
    const needed: Record<string, Set<String>> = {};
    let str = '';

    table = this.addSchemaForRelations(table);

    this.relations.forEach((rel) => {
      if (!rel.isM2M) {
        if (rel.childTable === table) {
          // current table is a child that belongsTo parent
          const pparent = _.upperFirst(rel.parentProp);
          str += `${sp}// ${rel.childModel} belongsTo ${rel.parentModel} via ${rel.parentId}\n`;
          str += `${sp}${rel.parentProp}!: ${rel.parentModel};\n`;
          str += `${sp}get${pparent}!: Sequelize.BelongsToGetAssociationMixin<${rel.parentModel}>;\n`;
          str += `${sp}set${pparent}!: Sequelize.BelongsToSetAssociationMixin<${rel.parentModel}, ${rel.parentModel}Id>;\n`;
          str += `${sp}create${pparent}!: Sequelize.BelongsToCreateAssociationMixin<${rel.parentModel}>;\n`;
          needed[rel.parentTable] ??= new Set();
          needed[rel.parentTable].add(rel.parentModel);
          needed[rel.parentTable].add(rel.parentModel + 'Id');
        } else if (rel.parentTable === table) {
          needed[rel.childTable] ??= new Set();
          const pchild = _.upperFirst(rel.childProp);
          if (rel.isOne) {
            // const hasModelSingular = singularize(hasModel);
            str += `${sp}// ${rel.parentModel} hasOne ${rel.childModel} via ${rel.parentId}\n`;
            str += `${sp}${rel.childProp}!: ${rel.childModel};\n`;
            str += `${sp}get${pchild}!: Sequelize.HasOneGetAssociationMixin<${rel.childModel}>;\n`;
            str += `${sp}set${pchild}!: Sequelize.HasOneSetAssociationMixin<${rel.childModel}, ${rel.childModel}Id>;\n`;
            str += `${sp}create${pchild}!: Sequelize.HasOneCreateAssociationMixin<${rel.childModel}>;\n`;
            needed[rel.childTable].add(rel.childModel);
            needed[rel.childTable].add(`${rel.childModel}Id`);
            needed[rel.childTable].add(`${rel.childModel}CreationAttributes`);
          } else {
            const hasModel = rel.childModel;
            const sing = _.upperFirst(singularize(rel.childProp));
            const lur = pluralize(rel.childProp);
            const plur = _.upperFirst(lur);
            str += `${sp}// ${rel.parentModel} hasMany ${rel.childModel} via ${rel.parentId}\n`;
            str += `${sp}${lur}!: ${rel.childModel}[];\n`;
            str += `${sp}get${plur}!: Sequelize.HasManyGetAssociationsMixin<${hasModel}>;\n`;
            str += `${sp}set${plur}!: Sequelize.HasManySetAssociationsMixin<${hasModel}, ${hasModel}Id>;\n`;
            str += `${sp}add${sing}!: Sequelize.HasManyAddAssociationMixin<${hasModel}, ${hasModel}Id>;\n`;
            str += `${sp}add${plur}!: Sequelize.HasManyAddAssociationsMixin<${hasModel}, ${hasModel}Id>;\n`;
            str += `${sp}create${sing}!: Sequelize.HasManyCreateAssociationMixin<${hasModel}>;\n`;
            str += `${sp}remove${sing}!: Sequelize.HasManyRemoveAssociationMixin<${hasModel}, ${hasModel}Id>;\n`;
            str += `${sp}remove${plur}!: Sequelize.HasManyRemoveAssociationsMixin<${hasModel}, ${hasModel}Id>;\n`;
            str += `${sp}has${sing}!: Sequelize.HasManyHasAssociationMixin<${hasModel}, ${hasModel}Id>;\n`;
            str += `${sp}has${plur}!: Sequelize.HasManyHasAssociationsMixin<${hasModel}, ${hasModel}Id>;\n`;
            str += `${sp}count${plur}!: Sequelize.HasManyCountAssociationsMixin;\n`;
            needed[rel.childTable].add(hasModel);
            needed[rel.childTable].add(`${hasModel}Id`);
          }
        }
      } else {
        // rel.isM2M
        if (rel.parentTable === table) {
          // many-to-many
          const isParent = rel.parentTable === table;
          const thisModel = isParent ? rel.parentModel : rel.childModel;
          const otherModel = isParent ? rel.childModel : rel.parentModel;
          const otherModelSingular = _.upperFirst(
            singularize(isParent ? rel.childProp : rel.parentProp),
          );
          const lotherModelPlural = pluralize(isParent ? rel.childProp : rel.parentProp);
          const otherModelPlural = _.upperFirst(lotherModelPlural);
          const otherTable = isParent ? rel.childTable : rel.parentTable;
          str += `${sp}// ${thisModel} belongsToMany ${otherModel} via ${rel.parentId} and ${rel.childId}\n`;
          str += `${sp}${lotherModelPlural}!: ${otherModel}[];\n`;
          str += `${sp}get${otherModelPlural}!: Sequelize.BelongsToManyGetAssociationsMixin<${otherModel}>;\n`;
          str += `${sp}set${otherModelPlural}!: Sequelize.BelongsToManySetAssociationsMixin<${otherModel}, ${otherModel}Id>;\n`;
          str += `${sp}add${otherModelSingular}!: Sequelize.BelongsToManyAddAssociationMixin<${otherModel}, ${otherModel}Id>;\n`;
          str += `${sp}add${otherModelPlural}!: Sequelize.BelongsToManyAddAssociationsMixin<${otherModel}, ${otherModel}Id>;\n`;
          str += `${sp}create${otherModelSingular}!: Sequelize.BelongsToManyCreateAssociationMixin<${otherModel}>;\n`;
          str += `${sp}remove${otherModelSingular}!: Sequelize.BelongsToManyRemoveAssociationMixin<${otherModel}, ${otherModel}Id>;\n`;
          str += `${sp}remove${otherModelPlural}!: Sequelize.BelongsToManyRemoveAssociationsMixin<${otherModel}, ${otherModel}Id>;\n`;
          str += `${sp}has${otherModelSingular}!: Sequelize.BelongsToManyHasAssociationMixin<${otherModel}, ${otherModel}Id>;\n`;
          str += `${sp}has${otherModelPlural}!: Sequelize.BelongsToManyHasAssociationsMixin<${otherModel}, ${otherModel}Id>;\n`;
          str += `${sp}count${otherModelPlural}!: Sequelize.BelongsToManyCountAssociationsMixin;\n`;
          needed[otherTable] ??= new Set();
          needed[otherTable].add(otherModel);
          needed[otherTable].add(`${otherModel}Id`);
        }
      }
    });
    if (needed[table]) {
      delete needed[table]; // don't add import for self
    }
    return { needed, str };
  }

  private addTypeScriptFields(table: string, isInterface: boolean) {
    const sp = this.space[1];
    const fields = _.keys(this.tables[table]);
    const notNull = isInterface ? '' : '!';
    let str = '';
    fields.forEach((field) => {
      if (!this.options.skipFields || !this.options.skipFields.includes(field)) {
        const name = this.quoteName(recase(this.options.caseProp, field));
        const isOptional = this.getTypeScriptFieldOptional(table, field);
        str += `${sp}${name}${isOptional ? '?' : notNull}: ${this.getTypeScriptType(
          table,
          field,
        )};\n`;
      }
    });
    return str;
  }

  private getTypeScriptFieldOptional(table: string, field: string) {
    const fieldObj = this.tables[table][field];
    return fieldObj.allowNull;
  }

  private getTypeScriptType(table: string, field: string) {
    const fieldObj = this.tables[table][field] as TSField;
    return this.getTypeScriptFieldType(fieldObj, 'type');
  }

  private getTypeScriptFieldType(fieldObj: TSField, attr: keyof TSField) {
    const rawFieldType = fieldObj[attr] || '';
    const fieldType = String(rawFieldType).toLowerCase();

    let jsType: string;

    if (this.isArray(fieldType)) {
      const eltype = this.getTypeScriptFieldType(fieldObj, 'elementType');
      jsType = eltype + '[]';
    } else if (this.isNumber(fieldType)) {
      jsType = 'number';
    } else if (this.isBoolean(fieldType)) {
      jsType = 'boolean';
    } else if (this.isDate(fieldType)) {
      jsType = 'Date';
    } else if (this.isString(fieldType)) {
      jsType = 'string';
    } else if (this.isEnum(fieldType)) {
      const values = this.getEnumValues(fieldObj);
      jsType = values.join(' | ');
    } else if (this.isJSON(fieldType)) {
      jsType = 'object';
    } else {
      console.log(`Missing TypeScript type: ${fieldType || fieldObj['type']}`);
      jsType = 'any';
    }
    return jsType;
  }

  private getEnumValues(fieldObj: TSField): string[] {
    if (fieldObj.special) {
      // postgres
      return fieldObj.special.map((v) => `'${v}'`);
    } else {
      // mysql
      return fieldObj.type.substring(5, fieldObj.type.length - 1).split(', ');
    }
  }

  private isTimestampField(field: string) {
    const additional = this.options.additional;
    if (additional.timestamps === false) {
      return false;
    }
    return (
      (!additional.createdAt && recase('c', field) === 'createdAt') ||
      additional.createdAt === field ||
      (!additional.updatedAt && recase('c', field) === 'updatedAt') ||
      additional.updatedAt === field
    );
  }

  private isParanoidField(field: string) {
    const additional = this.options.additional;
    if (additional.timestamps === false || additional.paranoid === false) {
      return false;
    }
    return (
      (!additional.deletedAt && recase('c', field) === 'deletedAt') ||
      additional.deletedAt === field
    );
  }

  private isIgnoredField(field: string) {
    return this.options.skipFields && this.options.skipFields.includes(field);
  }

  private escapeSpecial(val: string) {
    if (typeof val !== 'string') {
      return val;
    }
    return val
      .replace(/[\\]/g, '\\\\')
      .replace(/["]/g, '\\"')
      .replace(/[/]/g, '\\/')
      .replace(/[\b]/g, '\\b')
      .replace(/[\f]/g, '\\f')
      .replace(/[\n]/g, '\\n')
      .replace(/[\r]/g, '\\r')
      .replace(/[\t]/g, '\\t');
  }

  /** Quote the name if it is not a valid identifier */
  private quoteName(name: string) {
    return /^[$A-Z_][0-9A-Z_$]*$/i.test(name) ? name : "'" + name + "'";
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
