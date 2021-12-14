# Sequelize-oro

<!-- [![Greenkeeper badge](https://badges.greenkeeper.io/sequelize/sequelize-auto.svg)](https://greenkeeper.io/) -->

Automatically generate Migrations, Models for [SequelizeJS](https://github.com/sequelize/sequelize) via config file

Produced Migrations, Models are made to compatible with sequelize-cli package.

## Install

```
npm install sequelize-oro
```

## Prerequisites

You will need to install the correct dialect binding before using sequelize-oro.

| Dialect  | Install                                |
| -------- | -------------------------------------- |
| Postgres | `npm install sequelize pg pg-hstore` |

## Usage

### Migration

Sequelize migration generate from external config file.

```js
// Used For Generate Migrations from live database
const { SequelizeMigrate } = require('sequelize-oro');
const path = require('path');

require('dotenv-safe').config({
  path: path.join(__dirname, '/.env'),
  sample: path.join(__dirname, '/.env.example'),
});

const env = process.env.NODE_ENV || 'development';
const { [env]: config } = require('./config/config.json');

// Association is only created in lang ts type
// const options = { directory: `${__dirname}/models`, dialect: 'postgres' };
const migration = new SequelizeMigrate(config.database, config.username, config.password, {
  host: config.host,
  dialect: config.dialect,
  caseModel: 'p',
  directory: './db/migrations', // where to write files
  // lang:'ts',
  // tables: ['branch'],
  migrationTimestamp: 20211209091019,
  additional: {
    timestamps: true,
    underscored: true,
    // ...options added to each model
  },
});
migration.run().then((data) => {
  console.log(data.tables);
  // console.log(data.foreignKeys); // table foreign key list
  // console.log(data.indexes);     // table indexes
  // console.log(data.hasTriggerTables); // tables that have triggers
  // console.log(data.relations);   // relationships between models
  // console.log(data.text)         // text of generated models
});

```

### Model

Sequelize migration generate from external config file.

```js
// Used For Generate Models from live database
const { SequelizeModel } = require('sequelize-oro');
const path = require('path');

require('dotenv-safe').config({
  path: path.join(__dirname, '/.env'),
  sample: path.join(__dirname, '/.env.example'),
});

const env = process.env.NODE_ENV || 'development';
const { [env]: config } = require('./config/config.json');

// Association is only created in lang ts type
// const options = { directory: `${__dirname}/models`, dialect: 'postgres' };
const modelGenerate = new SequelizeModel(config.database, config.username, config.password, {
  host: config.host,
  dialect: config.dialect,
  caseModel: 'p',
  directory: './models', // where to write files
  // lang:'ts',
  // tables: ['plan'],
  additional: {
    timestamps: true,
    underscored: true,
    // ...options added to each model
  },
});
modelGenerate.run().then((data) => {
  console.log(data.tables);
  // console.log(data.foreignKeys); // table foreign key list
  // console.log(data.indexes);     // table indexes
  // console.log(data.hasTriggerTables); // tables that have triggers
  // console.log(data.relations);   // relationships between models
  // console.log(data.text)         // text of generated models
});

```


Open package.json and add thos two scripts to execute Migration and Model

```js
"scripts": {
    "generate_model": "node sequelizeModel.js",
    "generate_migration": "node sequelizeMigration.js"
  },
```

Now Finally Generate sequelize Models and Migration using following commands

> npm run generate_model

> npm run generate_migration
