import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import util from 'util';

import { FKSpec } from './../dialects/dialect-options';
import { TableData } from './types';
import {
  AutoOptions,
  CaseFileOption,
  CaseOption,
  LangOption,
  makeIndent,
  makeTableName,
  pluralize,
  qNameSplit,
  recase,
  Relation,
} from './types';
const mkdirp = require('mkdirp');

/** Writes text into files from TableData.text, and writes init-models */
export class AutoWriter {
  tableText: { [name: string]: string };
  foreignKeys: { [tableName: string]: { [fieldName: string]: FKSpec } };
  relations: Relation[];
  space: string[];
  type: any;
  options: {
    caseFile?: CaseFileOption;
    caseModel?: CaseOption;
    caseProp?: CaseOption;
    directory: string;
    lang?: LangOption;
    noAlias?: boolean;
    noWrite?: boolean;
    singularize?: boolean;
    useDefine?: boolean;
    spaces?: boolean;
    indentation?: number;
    migrationTimestamp?: number;
  };
  constructor(tableData: TableData, options: AutoOptions, type: any) {
    this.tableText = tableData.text as { [name: string]: string };
    this.foreignKeys = tableData.foreignKeys;
    this.relations = tableData.relations;
    this.options = options;
    this.type = type;
    this.space = makeIndent(this.options.spaces, this.options.indentation);
  }

  write() {
    if (this.options.noWrite) {
      return Promise.resolve();
    }

    mkdirp.sync(path.resolve(this.options.directory || './models'));

    const tables = _.keys(this.tableText).sort();
    console.log('tables');
    console.log(tables);

    const promises = tables.map((t) => {
      if (this.options.migrationTimestamp) {
        this.options.migrationTimestamp = this.options.migrationTimestamp + 1;
        // console.log(t, this.options.migrationTimestamp);
        return this.createFile(t, this.options.migrationTimestamp);
      }
    });

    // const isTypeScript = this.options.lang === 'ts';
    // const assoc = this.createAssociations(isTypeScript);

    // get table names without schema
    // TODO: add schema to model and file names when schema is non-default for the dialect
    // const tableNames = tables.map((t) => {
    //   const [schemaName, tableName] = qNameSplit(t);
    //   return tableName as string;
    // });

    return Promise.all(promises);
  }
  private createInitString(tableNames: string[], assoc: string, lang?: string) {
    switch (lang) {
      case 'ts':
        return this.createTsInitString(tableNames, assoc);
      case 'esm':
        return this.createESMInitString(tableNames, assoc);
      case 'es6':
        return this.createES5InitString(tableNames, assoc, 'const');
      default:
        return this.createES5InitString(tableNames, assoc, 'var');
    }
  }
  private createFile(table: string, timestamp: any) {
    // FIXME: schema is not used to write the file name and there could be collisions. For now it
    // is up to the developer to pick the right schema, and potentially chose different output
    // folders for each different schema.
    const [tableName] = qNameSplit(table);
    let fileName = recase(this.options.caseFile, tableName, this.options.singularize);
    if (this.type.forignKeys) {
      fileName = timestamp + '-' + fileName + '-forignKeys';
    } else {
      fileName = timestamp + '-' + fileName;
    }
    const filePath = path.join(
      this.options.directory,
      fileName + (this.options.lang === 'ts' ? '.ts' : '.js'),
    );

    const writeFile = util.promisify(fs.writeFile);
    return writeFile(path.resolve(filePath), this.tableText[table]);
  }

  /** Create the belongsToMany/belongsTo/hasMany/hasOne association strings */
  private createAssociations() {
    let strBelongs = '';
    let strBelongsToMany = '';
    const sp = this.space[1];

    const rels = this.relations;
    rels.forEach((rel) => {
      if (rel.isM2M) {
        const asprop = recase(this.options.caseProp, pluralize(rel.childProp));
        strBelongsToMany += `${sp}${rel.parentModel}.belongsToMany(${rel.childModel}, { as: '${asprop}', through: ${rel.joinModel}, foreignKey: "${rel.parentId}", otherKey: "${rel.childId}" });\n`;
      } else {
        // const bAlias = (this.options.noAlias && rel.parentModel.toLowerCase() === rel.parentProp.toLowerCase()) ? '' : `as: "${rel.parentProp}", `;
        const asParentProp = recase(this.options.caseProp, rel.parentProp);
        const bAlias = this.options.noAlias ? '' : `as: "${asParentProp}", `;
        strBelongs += `${sp}${rel.childModel}.belongsTo(${rel.parentModel}, { ${bAlias}foreignKey: "${rel.parentId}"});\n`;

        const hasRel = rel.isOne ? 'hasOne' : 'hasMany';
        // const hAlias = (this.options.noAlias && Utils.pluralize(rel.childModel.toLowerCase()) === rel.childProp.toLowerCase()) ? '' : `as: "${rel.childProp}", `;
        const asChildProp = recase(this.options.caseProp, rel.childProp);
        const hAlias = this.options.noAlias ? '' : `as: "${asChildProp}", `;
        strBelongs += `${sp}${rel.parentModel}.${hasRel}(${rel.childModel}, { ${hAlias}foreignKey: "${rel.parentId}"});\n`;
      }
    });

    // belongsToMany must come first
    return strBelongsToMany + strBelongs;
  }

  // create the TypeScript init-models file to load all the models into Sequelize
  private createTsInitString(tables: string[], assoc: string) {
    let str = 'import type { Sequelize } from "sequelize";\n';
    const sp = this.space[1];
    const modelNames: string[] = [];
    // import statements
    tables.forEach((t) => {
      const fileName = recase(this.options.caseFile, t, this.options.singularize);
      const modelName = makeTableName(
        this.options.caseModel,
        t,
        this.options.singularize,
        this.options.lang,
      );
      modelNames.push(modelName);
      str += `import { ${modelName} as _${modelName} } from "./${fileName}";\n`;
      str += `import type { ${modelName}Attributes, ${modelName}CreationAttributes } from "./${fileName}";\n`;
    });
    // re-export the model classes
    str += '\nexport {\n';
    modelNames.forEach((m) => {
      str += `${sp}_${m} as ${m},\n`;
    });
    str += '};\n';

    // re-export the model attirbutes
    str += '\nexport type {\n';
    modelNames.forEach((m) => {
      str += `${sp}${m}Attributes,\n`;
      str += `${sp}${m}CreationAttributes,\n`;
    });
    str += '};\n\n';

    // create the initialization function
    str += 'export function initModels(sequelize: Sequelize) {\n';
    modelNames.forEach((m) => {
      str += `${sp}const ${m} = _${m}.initModel(sequelize);\n`;
    });

    // add the asociations
    str += '\n' + assoc;

    // return the models
    str += `\n${sp}return {\n`;
    modelNames.forEach((m) => {
      str += `${this.space[2]}${m}: ${m},\n`;
    });
    str += `${sp}};\n`;
    str += '}\n';

    return str;
  }

  // create the ES5 init-models file to load all the models into Sequelize
  private createES5InitString(tables: string[], assoc: string, vardef: string) {
    let str = `${vardef} DataTypes = require("sequelize").DataTypes;\n`;
    const sp = this.space[1];
    const modelNames: string[] = [];
    // import statements
    tables.forEach((t) => {
      const fileName = recase(this.options.caseFile, t, this.options.singularize);
      const modelName = makeTableName(
        this.options.caseModel,
        t,
        this.options.singularize,
        this.options.lang,
      );
      modelNames.push(modelName);
      str += `${vardef} _${modelName} = require("./${fileName}");\n`;
    });

    // create the initialization function
    str += '\nfunction initModels(sequelize) {\n';
    modelNames.forEach((m) => {
      str += `${sp}${vardef} ${m} = _${m}(sequelize, DataTypes);\n`;
    });

    // add the asociations
    str += '\n' + assoc;

    // return the models
    str += `\n${sp}return {\n`;
    modelNames.forEach((m) => {
      str += `${this.space[2]}${m},\n`;
    });
    str += `${sp}};\n`;
    str += '}\n';
    str += 'module.exports = initModels;\n';
    str += 'module.exports.initModels = initModels;\n';
    str += 'module.exports.default = initModels;\n';
    return str;
  }

  // create the ESM init-models file to load all the models into Sequelize
  private createESMInitString(tables: string[], assoc: string) {
    let str = 'import _sequelize from "sequelize";\n';
    str += 'const DataTypes = _sequelize.DataTypes;\n';
    const sp = this.space[1];
    const modelNames: string[] = [];
    // import statements
    tables.forEach((t) => {
      const fileName = recase(this.options.caseFile, t, this.options.singularize);
      const modelName = makeTableName(
        this.options.caseModel,
        t,
        this.options.singularize,
        this.options.lang,
      );
      modelNames.push(modelName);
      str += `import _${modelName} from  "./${fileName}.js";\n`;
    });
    // create the initialization function
    str += '\nexport default function initModels(sequelize) {\n';
    modelNames.forEach((m) => {
      str += `${sp}const ${m} = _${m}.init(sequelize, DataTypes);\n`;
    });

    // add the associations
    str += '\n' + assoc;

    // return the models
    str += `\n${sp}return {\n`;
    modelNames.forEach((m) => {
      str += `${this.space[2]}${m},\n`;
    });
    str += `${sp}};\n`;
    str += '}\n';
    return str;
  }
}