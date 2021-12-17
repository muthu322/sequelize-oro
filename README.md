# Sequelize-oro

<!-- [![Greenkeeper badge](https://badges.greenkeeper.io/sequelize/sequelize-auto.svg)](https://greenkeeper.io/) -->

Automatically generate Migrations, Models and Seeder for [SequelizeJS](https://github.com/sequelize/sequelize) via config file

Produced Migrations, Models are made to compatible with sequelize-cli package.

## Install

```
npm install sequelize-oro
```

## Prerequisites

You will need to install the correct dialect binding before using sequelize-oro.

| Dialect       | Install                                  |
| ------------- | ---------------------------------------- |
| Postgres      | `npm install sequelize pg pg-hstore`   |
| sequelize-cli | `npm install --save-dev sequelize-cli` |

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

All Basic table data, indexes, functions, triggers, forign keys will be migrated in to specified directory. All migrations files are compatible with sequelize-cli, so after generating migration files, just run 

```
node_modules/.bin/sequelize db:migrate
```

Migrations are generated in alphabetical table order with given timestamp and after creating all basic tables it will create forign key constraint migrations.

### Model

Sequelize Model generate from external config file.

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

All Model data with relations and indexes will be generated from live database. Generated Model is compatible sequelize-cli.

### Seeders

Sequelize Seeder Generate from live Database

```js
// Used For Generate Models from live database
const { SequelizeSeeder } = require('sequelize-oro');
const path = require('path');

require('dotenv-safe').config({
  path: path.join(__dirname, '/.env'),
  sample: path.join(__dirname, '/.env.example'),
});

const env = process.env.NODE_ENV || 'development';
const { [env]: config } = require('./config/config.json');

// Association is only created in lang ts type
// const options = { directory: `${__dirname}/models`, dialect: 'postgres' };
const seederGenerate = new SequelizeSeeder(config.database, config.username, config.password, {
  logging: false,
  host: config.host,
  dialect: config.dialect,
  caseModel: 'p',
  directory: './db/seeders', // where to write files
  seederTimestamp: 20211209091019,
  // to avoid forign key dependency error it is ncessary to insert in certain order
  tables: ['city', 'role', 'user', 'address'],
  tableOptions: {
    city: {
      conditions: [
        {
          column: 'is_deleted',
          condition: '=',
          value: false,
        },
      ],
    },
    user: {
      conditions: [
        {
          column: 'is_deleted',
          condition: '=',
          value: false,
        },
        {
          column: 'id',
          condition: 'IN',
          value: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        },
      ],
    },
    role: {
      conditions: [
        {
          column: 'is_deleted',
          condition: '=',
          value: false,
        },
      ],
    },
    address: {
      conditions: [
        {
          column: 'is_deleted',
          condition: '=',
          value: false,
        },
        {
          column: 'user_id',
          condition: 'IS NOT',
          quotes: false,
          value: 'NULL',
        },
      ],
    },
  },
});
seederGenerate.run().then((data) => {
  // console.log(data.tables);
  // console.log(data.foreignKeys); // table foreign key list
  // console.log(data.indexes);     // table indexes
  // console.log(data.hasTriggerTables); // tables that have triggers
  // console.log(data.relations);   // relationships between models
  // console.log(data.text)         // text of generated models
});

```

Seeders can be generated with conditions and optional columns can be skipped from remote database.

### How to Run Config files

Open package.json and add thos two scripts to execute Migration and Model or directly run scripts using node command

```js
"scripts": {
    "generate_model": "node sequelizeModel.js",
    "generate_migration": "node sequelizeMigration.js"
  },
```

Now Finally Generate sequelize Models and Migration using following commands

> npm run generate_model

> npm run generate_migration
