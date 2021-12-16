import fs from 'fs';
// import _ from 'lodash';
import path from 'path';
import util from 'util';

// import { FKSpec } from './../dialects/dialect-options';
import { TableData } from './types';
import {
  AutoOptions,
  CaseFileOption,
  CaseOption,
  LangOption,
  makeIndent,
  // makeTableName,
  // qNameSplit,
  // recase,
  // Relation,
} from './types';
const mkdirp = require('mkdirp');

/** Writes text into files from TableData.text, and writes init-models */
export class AutoWriter {
  tableText!: string;
  tableData: TableData;
  // foreignKeys: { [tableName: string]: { [fieldName: string]: FKSpec } };
  // relations: Relation[];
  space: string[];
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
    seederTimestamp?: number;
  };
  constructor(tableData: TableData, options: AutoOptions) {
    if (tableData.text) {
      this.tableText = tableData.text;
    }
    this.tableData = tableData;
    // this.foreignKeys = tableData.foreignKeys;
    // this.relations = tableData.relations;
    this.options = options;
    this.space = makeIndent(this.options.spaces, this.options.indentation);
  }

  async write() {
    if (this.options.noWrite) {
      return Promise.resolve();
    }
    // console.log('write file working');
    mkdirp.sync(path.resolve(this.options.directory || './db/seeders'));

    const promises = [];
    const { tableName, timestamp } = this.tableData;
    // console.log(tableName, timestamp);
    const fileName = `${timestamp}-${tableName}.js`;
    const initFilePath = path.join(this.options.directory, fileName);
    // console.log(initFilePath);
    const writeFile = util.promisify(fs.writeFile);
    const initPromise = writeFile(path.resolve(initFilePath), this.tableText);
    promises.push(initPromise);

    await Promise.all(promises);
  }
}
